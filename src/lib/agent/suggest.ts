// Sugestie i projekty odpowiedzi z Claude — Faza 2.
// Cache w agent_suggestions po hashu faktów: koszt = tylko nowe/zmienione karty.
// Brak klucza albo błąd modelu → karta zostaje z sugestią regułową z Fazy 1.

import { createHash } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentAction, AgentCard, AgentPriority } from "@/app/(dashboard)/admin/agent/types";
import { AGENT_SYSTEM_PROMPT, buildCardPrompt } from "@/lib/agent/prompts";

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5";
const MAX_TOKENS = 600;
const CONCURRENCY = 8;
const DRAFT_KINDS = new Set<AgentAction["kind"]>(["request_info", "reply_email", "reply_social"]);
const PRIORITIES = new Set<string>(["high", "normal", "low"]);

type Suggestion = {
  suggestion: string;
  draft: string | null;
  priority: AgentPriority | null;
  primary_action: string | null;
};

type CachedRow = {
  card_id: string;
  input_hash: string;
  suggestion: string;
  draft: string | null;
  priority: string | null;
};

// Do promptu trafiają tytuł, fakty i rodzaje akcji — zmiana któregokolwiek = nowa sugestia.
function hashFacts(card: AgentCard): string {
  const input = { title: card.title, facts: card.facts, kinds: card.actions.map((a) => a.kind) };
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Model ma zwrócić goły JSON, ale zdejmujemy ewentualne ``` i tekst wokół. */
function parseSuggestion(raw: string): Suggestion | null {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  s = s.slice(start, end + 1);

  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.suggestion !== "string" || !o.suggestion.trim()) return null;

  return {
    suggestion: o.suggestion.trim(),
    draft: typeof o.draft === "string" && o.draft.trim() ? o.draft.trim() : null,
    priority: typeof o.priority === "string" && PRIORITIES.has(o.priority) ? (o.priority as AgentPriority) : null,
    primary_action: typeof o.primary_action === "string" ? o.primary_action : null,
  };
}

function applySuggestion(card: AgentCard, s: Suggestion): AgentCard {
  const hasPrimary = s.primary_action && card.actions.some((a) => a.kind === s.primary_action);
  const draftTarget = s.draft ? card.actions.find((a) => DRAFT_KINDS.has(a.kind)) : undefined;

  const actions = card.actions.map((a) => {
    const next: AgentAction = { ...a };
    if (hasPrimary) next.primary = a.kind === s.primary_action;
    if (draftTarget && a === draftTarget) next.draft = s.draft!;
    return next;
  });

  return {
    ...card,
    suggestion: s.suggestion,
    priority: s.priority ?? card.priority,
    actions,
  };
}

async function askModel(client: Anthropic, card: AgentCard): Promise<Suggestion | null> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: AGENT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildCardPrompt(card) }],
    output_config: { effort: "low" },
  });
  if (response.stop_reason === "refusal") return null;

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseSuggestion(text);
}

/** Prosty limiter równoległości — bez dodatkowej zależności. */
async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export async function enrichWithSuggestions(admin: SupabaseClient, cards: AgentCard[]): Promise<AgentCard[]> {
  if (cards.length === 0) return cards;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[agent] ANTHROPIC_API_KEY not set — sugestie regułowe");
    return cards;
  }

  const hashes = new Map(cards.map((c) => [c.id, hashFacts(c)]));
  const { data: rows } = await admin
    .from("agent_suggestions")
    .select("card_id, input_hash, suggestion, draft, priority")
    .in(
      "card_id",
      cards.map((c) => c.id)
    );
  const cached = new Map<string, CachedRow>(((rows ?? []) as CachedRow[]).map((r) => [r.card_id, r]));

  const result: AgentCard[] = [...cards];
  const pending: number[] = [];

  cards.forEach((card, i) => {
    const row = cached.get(card.id);
    if (row && row.input_hash === hashes.get(card.id)) {
      result[i] = applySuggestion(card, {
        suggestion: row.suggestion,
        draft: row.draft,
        priority: row.priority && PRIORITIES.has(row.priority) ? (row.priority as AgentPriority) : null,
        // primary_action nie jest cache'owane — zostaje to, co wyliczyła reguła
        primary_action: null,
      });
    } else {
      pending.push(i);
    }
  });

  if (pending.length === 0) return result;

  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });

  const settled = await runLimited(
    pending.map((i) => async () => {
      const card = cards[i];
      const s = await askModel(client, card);
      if (!s) throw new Error("brak poprawnego JSON w odpowiedzi modelu");
      const { error } = await admin.from("agent_suggestions").upsert({
        card_id: card.id,
        input_hash: hashes.get(card.id),
        suggestion: s.suggestion,
        draft: s.draft,
        priority: s.priority,
        model: MODEL,
        created_at: new Date().toISOString(),
      });
      if (error) console.warn("[agent] cache upsert failed:", error.message);
      return { i, s };
    }),
    CONCURRENCY
  );

  for (const r of settled) {
    if (r.status === "fulfilled") {
      result[r.value.i] = applySuggestion(cards[r.value.i], r.value.s);
    } else {
      console.warn("[agent] sugestia z modelu nieudana:", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }

  return result;
}

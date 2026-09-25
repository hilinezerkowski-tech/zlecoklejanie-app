// Źródło "Gmail" dla feedu agenta — Faza 3.
// Nieprzeczytane wątki ze skrzynki portalu (zlecoklejaniepl@gmail.com) jako
// karty "email". Nadawca dopasowany do bazy (klient / studio / grafik).
// Brak env GMAIL_* → źródło wyłączone (feed działa dalej).

import { gmail as gmailApi, auth as gmailAuth, type gmail_v1 } from "@googleapis/gmail";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCard, AgentPriority } from "@/app/(dashboard)/admin/agent/types";

const QUERY = "is:unread -label:Agent-obsluzone newer_than:14d";
const MAX_THREADS = 30;
const BODY_LIMIT = 1500;
const FACT_EXCERPT = 500;
const REQUEST_TIMEOUT_MS = 8000;
// Automaty i newslettery — nikt nie czeka na odpowiedź.
const AUTOMATED_SENDER = /no-?reply|mailer-daemon|postmaster|notifications?@|newsletter|bounce/i;

const serviceLabels: Record<string, string> = {
  oklejanie: "oklejanie",
  ppf: "PPF",
  branding: "branding",
  grafika: "grafika",
  inne: "inne",
};

type ParsedMessage = {
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  occurredAt: string;
  body: string;
  automated: boolean;
};

function getClient(): gmail_v1.Gmail | null {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth = new gmailAuth.OAuth2(clientId, clientSecret);
  oauth.setCredentials({ refresh_token: refreshToken });
  return gmailApi({ version: "v1", auth: oauth });
}

function header(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => (x.name ?? "").toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: raw.trim().toLowerCase() };
}

function decodePart(data: string | null | undefined): string {
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

/** Pierwsza część text/plain (rekurencyjnie); gdy brak — text/html bez tagów. */
function extractBody(part: gmail_v1.Schema$MessagePart | undefined): string {
  if (!part) return "";
  const walk = (p: gmail_v1.Schema$MessagePart, mime: string): string | null => {
    if (p.mimeType === mime && p.body?.data) return decodePart(p.body.data);
    for (const child of p.parts ?? []) {
      const found = walk(child, mime);
      if (found) return found;
    }
    return null;
  };
  const plain = walk(part, "text/plain");
  if (plain) return plain;
  const html = walk(part, "text/html");
  return html ? stripHtml(html) : "";
}

function cleanBody(text: string): string {
  // Ucinamy cytowaną historię wątku i sygnaturę — model ma czytać nową treść.
  const cut = text.split(/\r?\n(?:>|On .+ wrote:|W dniu .+ napisał|-----Original Message-----|________________)/)[0];
  return cut.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, BODY_LIMIT);
}

function parseThread(thread: gmail_v1.Schema$Thread): ParsedMessage | null {
  const messages = thread.messages ?? [];
  const last = messages[messages.length - 1];
  if (!last?.id || !thread.id) return null;
  const headers = last.payload?.headers;
  const from = parseFrom(header(headers, "From"));
  const automated =
    Boolean(header(headers, "List-Unsubscribe")) ||
    /bulk|list|auto_reply/i.test(header(headers, "Precedence")) ||
    Boolean(header(headers, "Auto-Submitted") && header(headers, "Auto-Submitted") !== "no") ||
    AUTOMATED_SENDER.test(from.email);
  const ms = Number(last.internalDate);
  return {
    threadId: thread.id,
    fromName: from.name,
    fromEmail: from.email,
    subject: header(headers, "Subject").trim() || "(bez tematu)",
    occurredAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString(),
    body: cleanBody(extractBody(last.payload)),
    automated,
  };
}

// --- dopasowanie nadawcy do bazy ----------------------------------------------

type SenderMatch = { fact: string; priority: AgentPriority; suggestion: string };

type ProfileRow = { id: string; role: string; email: string; full_name: string | null };

async function matchSenders(admin: SupabaseClient, emails: string[]): Promise<Map<string, SenderMatch>> {
  const result = new Map<string, SenderMatch>();
  if (emails.length === 0) return result;

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, role, email, full_name")
    .in("email", emails);
  const rows = (profiles ?? []) as ProfileRow[];
  if (rows.length === 0) return result;

  const byRole = (role: string) => rows.filter((r) => r.role === role).map((r) => r.id);
  const [studios, orders, designers] = await Promise.all([
    byRole("studio").length
      ? admin.from("studios").select("id, business_name, status").in("id", byRole("studio"))
      : Promise.resolve({ data: [] as { id: string; business_name: string | null; status: string }[] }),
    byRole("client").length
      ? admin
          .from("orders")
          .select("id, client_id, city, service_type, status, created_at")
          .in("client_id", byRole("client"))
          .not("status", "in", "(completed,cancelled)")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; client_id: string; city: string; service_type: string; status: string }[] }),
    byRole("designer").length
      ? admin.from("designers").select("id, display_name, status").in("id", byRole("designer"))
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; status: string }[] }),
  ]);

  const studioById = new Map((studios.data ?? []).map((s) => [s.id, s]));
  const designerById = new Map((designers.data ?? []).map((d) => [d.id, d]));
  const openOrderByClient = new Map<string, { id: string; city: string; service_type: string; status: string }>();
  for (const o of orders.data ?? []) {
    if (!openOrderByClient.has(o.client_id)) openOrderByClient.set(o.client_id, o);
  }

  for (const p of rows) {
    const email = p.email.toLowerCase();
    if (p.role === "studio") {
      const s = studioById.get(p.id);
      const status = s?.status ?? "brak rekordu";
      result.set(email, {
        fact: `Nadawca w bazie: studio ${s?.business_name || p.full_name || email}, status ${status}`,
        priority: status === "pending" ? "high" : "normal",
        suggestion:
          status === "pending"
            ? "Studio czeka na aktywację i pisze — odpisz i przy okazji sprawdź jego profil."
            : "Aktywne studio pisze do portalu — odpisz w ciągu dnia.",
      });
    } else if (p.role === "client") {
      const o = openOrderByClient.get(p.id);
      if (o) {
        result.set(email, {
          fact: `Nadawca w bazie: klient zlecenia ${o.id.slice(0, 8)} (${o.city}, ${serviceLabels[o.service_type] || o.service_type}, status ${o.status})`,
          priority: "high",
          suggestion: "Klient z otwartym zleceniem czeka na odpowiedź — odpisz dziś.",
        });
      } else {
        result.set(email, {
          fact: `Nadawca w bazie: klient ${p.full_name || email}, bez otwartego zlecenia`,
          priority: "normal",
          suggestion: "Były klient pisze — odpisz i zaproś do nowego zgłoszenia, jeśli chodzi o kolejne auto.",
        });
      }
    } else if (p.role === "designer") {
      const d = designerById.get(p.id);
      result.set(email, {
        fact: `Nadawca w bazie: grafik ${d?.display_name || p.full_name || email}, status ${d?.status ?? "brak rekordu"}`,
        priority: d?.status === "pending" ? "high" : "normal",
        suggestion: "Grafik z bazy pisze — odpisz w ciągu dnia.",
      });
    } else if (p.role === "admin") {
      result.set(email, { fact: "Nadawca: konto administratora", priority: "low", suggestion: "Mail od admina — prawdopodobnie test." });
    }
  }
  return result;
}

// --- karty ---------------------------------------------------------------------

export async function fetchGmailCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const g = getClient();
  if (!g) {
    console.warn("[agent] GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN not set — źródło Gmail wyłączone");
    return [];
  }

  try {
    const opts = { timeout: REQUEST_TIMEOUT_MS };
    const [profile, list] = await Promise.all([
      g.users.getProfile({ userId: "me" }, opts),
      g.users.threads.list({ userId: "me", q: QUERY, maxResults: MAX_THREADS }, opts),
    ]);
    const me = (profile.data.emailAddress ?? "").toLowerCase();
    const ids = (list.data.threads ?? []).map((t) => t.id).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];

    const threads = await Promise.all(
      ids.map((id) => g.users.threads.get({ userId: "me", id, format: "full" }, opts))
    );
    const parsed = threads
      .map((t) => parseThread(t.data))
      .filter((m): m is ParsedMessage => m !== null)
      .filter((m) => m.fromEmail && m.fromEmail !== me && !m.automated);
    if (parsed.length === 0) return [];

    const matches = await matchSenders(admin, Array.from(new Set(parsed.map((m) => m.fromEmail))));

    return parsed.map((m) => {
      const match = matches.get(m.fromEmail) ?? {
        fact: "Nieznany nadawca — brak konta w bazie",
        priority: "normal" as AgentPriority,
        suggestion: "Nieznany nadawca — sprawdź, czy to klient czy wykonawca, i odpisz z właściwym linkiem.",
      };
      const excerpt = m.body.length > FACT_EXCERPT ? m.body.slice(0, FACT_EXCERPT) + "…" : m.body;
      const facts = [
        `Od: ${m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail}`,
        `Temat: ${m.subject}`,
        excerpt ? `Treść: „${excerpt}”` : "Treść: (pusta — tylko załączniki lub HTML bez tekstu)",
        match.fact,
      ];

      const card: AgentCard = {
        id: `mail:${m.threadId}`,
        type: "email",
        priority: match.priority,
        source: "Gmail",
        occurredAt: m.occurredAt,
        title: `${m.subject} — ${m.fromName || m.fromEmail}`,
        facts,
        suggestion: match.suggestion,
        actions: [
          { kind: "reply_email", label: "Odpisz", primary: true },
          { kind: "open", label: "Otwórz w Gmail", href: `https://mail.google.com/mail/u/0/#inbox/${m.threadId}` },
          { kind: "dismiss", label: "Później" },
        ],
      };
      return card;
    });
  } catch (e) {
    console.warn("[agent] Gmail source failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

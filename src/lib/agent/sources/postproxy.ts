// Źródło "Facebook/Instagram" dla feedu agenta — Faza 4.
// Komentarze pod postami z ostatnich 30 dni bez naszej odpowiedzi, i DM-y,
// których ostatnia wiadomość nie jest od nas. Tylko konta ZlecOklejanie —
// FB "Wojciech Zer" (mxUdAk) i IG @zlecoklejanie (wZU3pb). NIGDY profile Hiline
// (mimo że dzielą profile_group AnF0Ll z FB) — filtrujemy zawsze po profile_id.
// Brak env POSTPROXY_API_KEY → źródło wyłączone (feed działa dalej).
//
// REST API Postproxy: https://api.postproxy.dev/api, auth Authorization: Bearer.
// page/per_page (1-based), odpowiedź { total, page, per_page, data }.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCard, AgentPriority } from "@/app/(dashboard)/admin/agent/types";

const API_BASE = "https://api.postproxy.dev/api";
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const POSTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_POSTS_CHECKED = 25;
const FACT_EXCERPT = 300;
// Pytania o cenę/lokalizację/dołączenie — reszta ma niższy priorytet.
const PRICE_OR_JOIN_QUESTION = /\b(ile|cena|koszt|gdzie|jak doł[ąa]czy[ćc])\b/i;

type Profile = { id: string; groupId: string; platform: "facebook" | "instagram"; label: "Facebook" | "Instagram" };

// Tylko te dwa konta — nigdy Hiline (współdzieli profile_group AnF0Ll z FB).
const PROFILES: Profile[] = [
  { id: "mxUdAk", groupId: "AnF0Ll", platform: "facebook", label: "Facebook" },
  { id: "wZU3pb", groupId: "18F2R7", platform: "instagram", label: "Instagram" },
];

type PostproxyPost = {
  id: string;
  body: string | null;
  created_at: string;
  platforms: { platform: string; profile_id: string }[] | null;
};

type PostproxyComment = {
  id: string;
  external_id: string;
  body: string;
  author_username: string | null;
  posted_at: string | null;
  created_at: string;
  permalink: string | null;
  like_count: number | null;
  replies: unknown[] | null;
};

type PostproxyChat = {
  id: string;
  participant_username: string | null;
  participant_name: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_at: string | null;
};

type PostproxyMessage = {
  direction: "inbound" | "outbound";
  body: string | null;
  external_posted_at: string | null;
  created_at: string;
};

type ProfileInfo = { id: string; username: string | null };

let cache: { at: number; cards: AgentCard[] } | null = null;

function apiKey(): string | null {
  return process.env.POSTPROXY_API_KEY || null;
}

async function pp<T>(path: string, key: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Postproxy ${path} -> ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function excerpt(text: string, max = FACT_EXCERPT): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// --- komentarze ---------------------------------------------------------------

async function fetchCommentCards(
  key: string,
  profile: Profile,
  myUsername: string | null
): Promise<AgentCard[]> {
  const since = new Date(Date.now() - POSTS_WINDOW_MS).toISOString();
  const posts = await pp<{ data: PostproxyPost[] }>(
    `/posts?profile_group_id=${profile.groupId}&status=published&per_page=50&from=${encodeURIComponent(since)}`,
    key
  ).catch(() => ({ data: [] as PostproxyPost[] }));

  // Tylko posty faktycznie opublikowane NA TYM profilu (grupa może mieć inne konta).
  const relevant = (posts.data ?? [])
    .filter((p) => (p.platforms ?? []).some((pl) => pl.profile_id === profile.id))
    .slice(0, MAX_POSTS_CHECKED);
  if (relevant.length === 0) return [];

  const perPost = await Promise.all(
    relevant.map((post) =>
      pp<{ data: PostproxyComment[] }>(
        `/posts/${post.id}/comments?profile_id=${profile.id}&per_page=50`,
        key
      )
        .then((r) => ({ post, comments: r.data ?? [] }))
        .catch(() => ({ post, comments: [] as PostproxyComment[] }))
    )
  );

  const cards: AgentCard[] = [];
  for (const { post, comments } of perPost) {
    const postLabel = post.body ? excerpt(post.body, 80) : "post bez treści";
    for (const c of comments) {
      const alreadyAnswered = Array.isArray(c.replies) && c.replies.length > 0;
      const isOwnComment = myUsername && c.author_username && c.author_username.toLowerCase() === myUsername.toLowerCase();
      if (alreadyAnswered || isOwnComment) continue;

      const body = (c.body || "").trim();
      const priority: AgentPriority = PRICE_OR_JOIN_QUESTION.test(body) ? "normal" : "low";
      const author = c.author_username || "nieznany autor";

      const actions: AgentCard["actions"] = [{ kind: "reply_social", label: "Odpowiedz", primary: true }];
      if (c.permalink) actions.push({ kind: "open", label: "Otwórz komentarz", href: c.permalink });
      actions.push({ kind: "dismiss", label: "Później" });

      cards.push({
        id: `dmc:comment:${profile.label}:${c.external_id || c.id}`,
        type: "dm_comment",
        priority,
        source: profile.label,
        occurredAt: c.posted_at || c.created_at,
        title: `Komentarz pod postem — ${author}`,
        facts: [
          `Autor: ${author}`,
          `Treść: „${excerpt(body || "(pusty komentarz)")}”`,
          `Post: „${postLabel}” (${new Date(post.created_at).toLocaleDateString("pl-PL")})`,
          `Reakcje: ${c.like_count ?? 0}`,
        ],
        suggestion:
          priority === "normal"
            ? "Pyta o cenę/lokalizację/dołączenie — odpowiedz i skieruj do formularza na zlecoklejanie.pl."
            : "Komentarz bez odpowiedzi — odpisz, żeby podtrzymać zaangażowanie pod postem.",
        actions,
      });
    }
  }
  return cards;
}

// --- DM-y ----------------------------------------------------------------------

async function fetchChatCards(
  admin: SupabaseClient,
  key: string,
  profile: Profile
): Promise<AgentCard[]> {
  const chats = await pp<{ data: PostproxyChat[] }>(
    `/profiles/${profile.id}/chats?per_page=20`,
    key
  ).catch(() => ({ data: [] as PostproxyChat[] }));

  const unanswered = (chats.data ?? []).filter(
    (c) => c.last_inbound_at && (!c.last_outbound_at || c.last_inbound_at > c.last_outbound_at)
  );
  if (unanswered.length === 0) return [];

  // Dopasowanie handle'a IG/FB do bazy leadów freelancerów — jednym zapytaniem dla wszystkich.
  const handles = unanswered.map((c) => (c.participant_username || "").toLowerCase()).filter(Boolean);
  const leadHandles = new Set<string>();
  if (handles.length > 0) {
    const { data: leads } = await admin
      .from("freelancer_leads")
      .select("handle, instagram_url")
      .or(handles.map((h) => `handle.ilike.%${h}%,instagram_url.ilike.%${h}%`).join(","));
    for (const lead of (leads ?? []) as { handle: string | null; instagram_url: string | null }[]) {
      for (const h of handles) {
        if (
          (lead.handle && lead.handle.toLowerCase().includes(h)) ||
          (lead.instagram_url && lead.instagram_url.toLowerCase().includes(h))
        ) {
          leadHandles.add(h);
        }
      }
    }
  }

  const withMessages = await Promise.all(
    unanswered.map((chat) =>
      pp<{ data: PostproxyMessage[] }>(`/chats/${chat.id}/messages?per_page=3`, key)
        .then((r) => ({ chat, messages: r.data ?? [] }))
        .catch(() => ({ chat, messages: [] as PostproxyMessage[] }))
    )
  );

  return withMessages.map(({ chat, messages }) => {
    const name = chat.participant_name || chat.participant_username || "nieznany nadawca";
    const handle = (chat.participant_username || "").toLowerCase();
    const inBase = handle && leadHandles.has(handle);
    // Wiadomości przychodzą najnowsza→najstarsza — do faktów w kolejności chronologicznej.
    const chrono = [...messages].reverse();
    const lastInbound = messages.find((m) => m.direction === "inbound")?.body || "";
    const priority: AgentPriority = PRICE_OR_JOIN_QUESTION.test(lastInbound) ? "normal" : "low";

    return {
      id: `dmc:chat:${profile.label}:${chat.id}`,
      type: "dm_comment",
      priority,
      source: profile.label,
      occurredAt: chat.last_inbound_at || chat.last_message_at || new Date().toISOString(),
      title: `Wiadomość prywatna — ${name}`,
      facts: [
        `Od: ${name}${chat.participant_username ? ` (@${chat.participant_username})` : ""}`,
        ...chrono.map((m) => `${m.direction === "inbound" ? "Oni" : "My"}: „${excerpt(m.body || "(załącznik/brak treści)", 200)}”`),
        `W bazie leadów freelancerów: ${inBase ? "TAK" : "NIE"}`,
      ],
      suggestion:
        priority === "normal"
          ? "Pyta o cenę/lokalizację/dołączenie — odpowiedz i skieruj do formularza na zlecoklejanie.pl."
          : "Wiadomość czeka na odpowiedź.",
      actions: [
        { kind: "reply_social", label: "Odpowiedz", primary: true },
        { kind: "dismiss", label: "Później" },
      ],
    } satisfies AgentCard;
  });
}

// --- wejście ---------------------------------------------------------------------

export async function fetchPostproxyCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const key = apiKey();
  if (!key) {
    console.warn("[agent] POSTPROXY_API_KEY not set — źródło Facebook/Instagram wyłączone");
    return [];
  }

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cards;

  const results = await Promise.allSettled(
    PROFILES.map(async (profile) => {
      const me = await pp<{ data: ProfileInfo[] }>(`/profiles?profile_group_id=${profile.groupId}`, key).catch(
        () => ({ data: [] as ProfileInfo[] })
      );
      const myUsername = me.data.find((p) => p.id === profile.id)?.username ?? null;

      const [commentCards, chatCards] = await Promise.all([
        fetchCommentCards(key, profile, myUsername),
        fetchChatCards(admin, key, profile),
      ]);
      return [...commentCards, ...chatCards];
    })
  );

  const cards: AgentCard[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") cards.push(...r.value);
    else console.warn("[agent] Postproxy source failed:", r.reason instanceof Error ? r.reason.message : r.reason);
  }

  cache = { at: Date.now(), cards };
  return cards;
}

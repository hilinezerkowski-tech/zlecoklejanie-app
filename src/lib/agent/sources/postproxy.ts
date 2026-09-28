// Źródło "Facebook/Instagram" dla feedu agenta — Faza 4.
// Komentarze pod postami z ostatnich 30 dni bez naszej odpowiedzi, i DM-y,
// których ostatnia wiadomość nie jest od nas. Tylko konta ZlecOklejanie. NIGDY Hiline.
//
// Dwa osobne konta Postproxy, dwa klucze:
// - POSTPROXY_API_KEY (konto "Wizytówka Hiline"): FB "Wojciech Zer" (mxUdAk). Ten profil
//   publikuje na KILKA stron (ZlecOklejanie, Hiline, Eco Sim) — bierzemy tylko posty,
//   których link zaczyna się od id strony ZlecOklejanie. DM-ów FB nie bierzemy wcale:
//   czat nie mówi, której strony dotyczy, a odpowiedź mogłaby pójść jako Hiline.
// - POSTPROXY_API_KEY_IG (konto portalu): IG @zlecoklejanie (wZU3pb) — komentarze i DM.
// Brak klucza danego konta → ten profil pominięty (feed działa dalej).
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
// Bez \b — w JS nie traktuje polskich liter jako części słowa.
const PRICE_OR_JOIN_QUESTION = /(?:^|[^a-ząćęłńóśźż])(ile|cen[aęy]|koszt|gdzie|jak doł[ąa]czy)/i;

type Profile = {
  id: string;
  groupId: string;
  platform: "facebook" | "instagram";
  label: "Facebook" | "Instagram";
  keyEnv: "POSTPROXY_API_KEY" | "POSTPROXY_API_KEY_IG";
  /** FB: strona, której posty bierzemy (link posta = facebook.com/<pageId>_<postId>). */
  pageId?: string;
  /** Autorzy, których komentarze nie czekają na odpowiedź (nasze konta). */
  ownAuthors: RegExp;
};

const ZLEC_FB_PAGE_ID = "1288058921054739";

const PROFILES: Profile[] = [
  {
    id: "mxUdAk",
    groupId: "AnF0Ll",
    platform: "facebook",
    label: "Facebook",
    keyEnv: "POSTPROXY_API_KEY",
    pageId: ZLEC_FB_PAGE_ID,
    ownAuthors: /zlecoklejanie|hiline/i,
  },
  {
    id: "wZU3pb",
    groupId: "18F2R7",
    platform: "instagram",
    label: "Instagram",
    keyEnv: "POSTPROXY_API_KEY_IG",
    ownAuthors: /^zlecoklejanie|^hiline/i,
  },
];

type PostproxyPost = {
  id: string;
  body: string | null;
  created_at: string;
  platforms: { platform: string; profile_id: string; url?: string | null }[] | null;
};

/** Post opublikowany na TYM profilu i — dla FB — na stronie ZlecOklejanie (nie Hiline). */
function isOnProfile(post: PostproxyPost, profile: Profile): boolean {
  return (post.platforms ?? []).some(
    (pl) => pl.profile_id === profile.id && (!profile.pageId || (pl.url ?? "").includes(`/${profile.pageId}_`))
  );
}

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

function apiKey(profile: Profile): string | null {
  return process.env[profile.keyEnv] || null;
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

/** "https://www.instagram.com/nick/?hl=pl" → "nick" */
function handleFromUrl(url: string | null): string {
  if (!url) return "";
  const m = url.match(/instagram\.com\/([^/?#\s]+)/i);
  return m ? m[1].toLowerCase() : "";
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
  // /api/posts nie ma filtra po dacie utworzenia — okno 30 dni liczymy sami.
  const since = Date.now() - POSTS_WINDOW_MS;
  const posts = await pp<{ data?: PostproxyPost[] }>(
    `/posts?profile_group_id=${profile.groupId}&status=published&per_page=50`,
    key
  ).catch(() => ({ data: [] as PostproxyPost[] }));

  // Tylko posty faktycznie opublikowane NA TYM profilu (grupa może mieć inne konta).
  const relevant = (posts.data ?? [])
    .filter((p) => Date.parse(p.created_at) >= since)
    .filter((p) => isOnProfile(p, profile))
    .slice(0, MAX_POSTS_CHECKED);
  if (relevant.length === 0) return [];

  const perPost = await Promise.all(
    relevant.map((post) =>
      pp<{ data?: PostproxyComment[] }>(
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
      const author0 = c.author_username || "";
      const isOwnComment =
        (myUsername && author0.toLowerCase() === myUsername.toLowerCase()) || profile.ownAuthors.test(author0);
      if (alreadyAnswered || isOwnComment) continue;

      const body = (c.body || "").trim();
      const priority: AgentPriority = PRICE_OR_JOIN_QUESTION.test(body) ? "normal" : "low";
      const author = c.author_username || "nieznany autor";

      const actions: AgentCard["actions"] = [
        {
          kind: "reply_social",
          label: "Odpowiedz",
          primary: true,
          payload: { mode: "comment", profileId: profile.id, postId: post.id, parentId: c.external_id || c.id },
        },
      ];
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
  // FB: czat nie mówi, której strony dotyczy (profil obsługuje też Hiline) — pomijamy.
  if (profile.platform === "facebook") return [];
  const chats = await pp<{ data?: PostproxyChat[] }>(
    `/profiles/${profile.id}/chats?per_page=20`,
    key
  ).catch(() => ({ data: [] as PostproxyChat[] }));

  // Ostatnia wiadomość przychodząca nowsza niż nasza odpowiedź = czeka na nas.
  const unanswered = (chats.data ?? []).filter((c) => {
    if (!c.last_inbound_at) return false;
    if (!c.last_outbound_at) return true;
    return Date.parse(c.last_inbound_at) > Date.parse(c.last_outbound_at);
  });
  if (unanswered.length === 0) return [];

  // Dopasowanie handle'a IG do bazy leadów freelancerów. Tabela jest mała —
  // porównujemy w JS zamiast składać filtr .or() z nazw użytkowników.
  const leadHandles = new Set<string>();
  if (profile.platform === "instagram") {
    const { data: leads } = await admin.from("freelancer_leads").select("handle, instagram_url").limit(5000);
    const known = ((leads ?? []) as { handle: string | null; instagram_url: string | null }[]).flatMap((l) => [
      (l.handle || "").replace(/^@/, "").toLowerCase(),
      handleFromUrl(l.instagram_url),
    ]);
    const knownSet = new Set(known.filter(Boolean));
    for (const c of unanswered) {
      const h = (c.participant_username || "").replace(/^@/, "").toLowerCase();
      if (h && knownSet.has(h)) leadHandles.add(h);
    }
  }

  const withMessages = await Promise.all(
    unanswered.map((chat) =>
      pp<{ data?: PostproxyMessage[] }>(`/chats/${chat.id}/messages?per_page=3`, key)
        .then((r) => ({ chat, messages: r.data ?? [] }))
        .catch(() => ({ chat, messages: [] as PostproxyMessage[] }))
    )
  );

  return withMessages.map(({ chat, messages }) => {
    const name = chat.participant_name || chat.participant_username || "nieznany nadawca";
    const handle = (chat.participant_username || "").replace(/^@/, "").toLowerCase();
    const inBase = Boolean(handle) && leadHandles.has(handle);
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
        ...(profile.platform === "instagram" ? [`W bazie leadów freelancerów: ${inBase ? "TAK" : "NIE"}`] : []),
      ],
      suggestion:
        priority === "normal"
          ? "Pyta o cenę/lokalizację/dołączenie — odpowiedz i skieruj do formularza na zlecoklejanie.pl."
          : "Wiadomość czeka na odpowiedź.",
      actions: [
        {
          kind: "reply_social",
          label: "Odpowiedz",
          primary: true,
          payload: { mode: "chat", profileId: profile.id, chatId: chat.id },
        },
        { kind: "dismiss", label: "Później" },
      ],
    } satisfies AgentCard;
  });
}

// --- wejście ---------------------------------------------------------------------

export async function fetchPostproxyCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const active = PROFILES.filter((p) => {
    if (apiKey(p)) return true;
    console.warn(`[agent] ${p.keyEnv} not set — źródło ${p.label} wyłączone`);
    return false;
  });
  if (active.length === 0) return [];

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cards;

  const results = await Promise.allSettled(
    active.map(async (profile) => {
      const key = apiKey(profile)!;
      const me = await pp<{ data?: ProfileInfo[] }>(`/profiles?profile_group_id=${profile.groupId}`, key).catch(
        () => ({ data: [] as ProfileInfo[] })
      );
      const myUsername = (me.data ?? []).find((p) => p.id === profile.id)?.username ?? null;

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

// --- odpowiedź z panelu agenta (Faza 5) -------------------------------------------
// Dokumentacja: https://postproxy.dev/reference/comments/ i /reference/direct-messages/

async function ppSend<T>(path: string, key: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`Postproxy ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export type SocialReplyTarget =
  | { mode: "comment"; profileId: string; postId: string; parentId: string }
  | { mode: "chat"; profileId: string; chatId: string };

/**
 * Odpowiedź pod komentarzem albo w DM — wyłącznie z kont ZlecOklejanie (lista
 * PROFILES). Klucz Postproxy widzi też profile i strony Hiline, więc profil, strona
 * posta i czat są sprawdzane po stronie serwera, nie brane na wiarę z przeglądarki.
 */
export async function sendSocialReply(
  target: SocialReplyTarget,
  text: string
): Promise<{ ok: true; where: string } | { ok: false; error: string }> {
  const profile = PROFILES.find((p) => p.id === target.profileId);
  if (!profile) return { ok: false, error: "Nieznany profil — odpowiadamy tylko z kont ZlecOklejanie." };
  const key = apiKey(profile);
  if (!key) return { ok: false, error: `Postproxy nie jest skonfigurowany na serwerze (brak ${profile.keyEnv}).` };

  if (target.mode === "comment") {
    // Na FB ten sam profil publikuje też na stronie Hiline — sprawdzamy stronę posta.
    const post = await pp<PostproxyPost>(`/posts/${encodeURIComponent(target.postId)}`, key).catch(() => null);
    if (!post || !isOnProfile(post, profile)) {
      return { ok: false, error: "Post nie jest na stronie ZlecOklejanie — odpowiedź wstrzymana." };
    }
    await ppSend(
      `/posts/${encodeURIComponent(target.postId)}/comments?profile_id=${encodeURIComponent(profile.id)}`,
      key,
      { body: text, parent_id: target.parentId }
    );
    cache = null;
    return { ok: true, where: `komentarz na ${profile.label}` };
  }

  if (profile.platform === "facebook") {
    return { ok: false, error: "DM na Facebooku są wyłączone — czat nie mówi, czy to strona ZlecOklejanie, czy Hiline." };
  }
  const chats = await pp<{ data?: PostproxyChat[] }>(`/profiles/${profile.id}/chats?per_page=50`, key);
  if (!(chats.data ?? []).some((c) => c.id === target.chatId)) {
    return { ok: false, error: "Ten czat nie należy do profilu ZlecOklejanie — wysyłka wstrzymana." };
  }
  // Bez tagu HUMAN_AGENT: Meta pozwala na wolną odpowiedź w 24 h od ostatniej wiadomości;
  // poza oknem Postproxy zwróci błąd i admin zobaczy go w toaście.
  await ppSend(`/chats/${encodeURIComponent(target.chatId)}/messages`, key, { body: text });
  cache = null;
  return { ok: true, where: `wiadomość prywatna na ${profile.label}` };
}

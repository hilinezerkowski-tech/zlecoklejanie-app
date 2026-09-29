// Źródło "Gmail" dla feedu agenta — Faza 3.
// Wątki ze skrzynki portalu (zlecoklejaniepl@gmail.com), w których ostatnia
// wiadomość jest od kogoś z zewnątrz — czyli czekają na naszą odpowiedź — jako
// karty "email". Nadawca dopasowany do bazy (klient / studio / grafik).
// Brak env GMAIL_* → źródło wyłączone (feed działa dalej).

import { gmail as gmailApi, auth as gmailAuth, type gmail_v1 } from "@googleapis/gmail";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentCard, AgentPriority } from "@/app/(dashboard)/admin/agent/types";
import { labelUslugi } from "@/lib/uslugi";

// Bez is:unread (odejście od briefu): skrzynkę czyta się też w Gmailu, a przeczytany
// mail bez odpowiedzi dalej czeka. Wątek z naszą odpowiedzią na końcu odpada niżej.
const QUERY = "in:inbox -label:Agent-obsluzone newer_than:14d";
// Gmail liczy limit "jednostek na minutę na użytkownika": threads.get = 10 jednostek.
// 20 wątków po 5 naraz + cache 3 min trzyma się daleko od limitu przy częstym "Odśwież".
const MAX_THREADS = 20;
const GET_CONCURRENCY = 5;
const CACHE_TTL_MS = 3 * 60_000;
const BODY_LIMIT = 1500;
const FACT_EXCERPT = 500;
const REQUEST_TIMEOUT_MS = 8000;
// Automaty i newslettery — nikt nie czeka na odpowiedź.
const AUTOMATED_SENDER = /no-?reply|mailer-daemon|postmaster|notifications?@|newsletter|bounce/i;
// Własne maile portalu (powiadomienia@, kontakt@ — kopie wysłanych odpowiedzi
// wracają przez ImprovMX jako nieprzeczytane) i powiadomienia platform: leady z nich
// są już w feedzie jako karty z bazy, a "odpowiedź" poszłaby do automatu.
const SKIPPED_SENDER_DOMAIN = /(^|\.)(zlecoklejanie\.pl|netlify\.com|vercel\.com|supabase\.(io|com)|mailerlite\.com|github\.com|resend\.(com|dev))$/i;

type ParsedMessage = {
  threadId: string;
  /** Id ostatniej wiadomości w wątku — część id karty. */
  messageId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  occurredAt: string;
  body: string;
  automated: boolean;
  unread: boolean;
};

function getGmailClient(): gmail_v1.Gmail | null {
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

const QUOTE_HEADER = /^(On .+ wrote:|W dniu .+ napisał(\(a\))?:?|.+ napisał\(a\):)$/;
const QUOTED_ORIGINAL = /^(-{3,} ?(Original Message|Oryginalna wiadomość) ?-{3,}|From: .+|Od: .+<.+@.+>|_{10,})$/;

/**
 * Zostawia nową treść wiadomości, bez cytowanej historii — model ma czytać to,
 * co nadawca napisał teraz. Obsługuje odpowiedź nad cytatem (Gmail, Outlook:
 * ucinamy od nagłówka cytatu) i pod cytatem (Thunderbird/Roundcube: cytat to
 * linie z ">", odpowiedź jest niżej i zostaje).
 */
function cleanBody(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (QUOTED_ORIGINAL.test(t)) break;
    if (t.startsWith(">")) continue;
    if (QUOTE_HEADER.test(t)) {
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      if (next?.trim().startsWith(">")) continue;
      break;
    }
    kept.push(lines[i]);
  }
  return kept
    .join("\n")
    // Stopki antywirusów w stylu Avast: obrazek-śledzik i "Nie zawiera wirusów".
    .replace(/[[<]?https?:\/\/\S*(?:avast|avcdn)\S*[\]>]?/gi, "")
    .replace(/Nie zawiera wirusów\.?|Virus-free\.?|www\.avast\.com/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, BODY_LIMIT);
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
    AUTOMATED_SENDER.test(from.email) ||
    SKIPPED_SENDER_DOMAIN.test(from.email.split("@")[1] ?? "");
  const ms = Number(last.internalDate);
  return {
    threadId: thread.id,
    messageId: last.id,
    fromName: from.name,
    fromEmail: from.email,
    subject: header(headers, "Subject").trim() || "(bez tematu)",
    occurredAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : new Date().toISOString(),
    body: cleanBody(extractBody(last.payload)),
    automated,
    unread: (last.labelIds ?? []).includes("UNREAD"),
  };
}

// --- dopasowanie nadawcy do bazy ----------------------------------------------

type SenderMatch = { fact: string; priority: AgentPriority; suggestion: string; skip?: boolean };

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
          fact: `Nadawca w bazie: klient zlecenia ${o.id.slice(0, 8)} (${o.city}, ${labelUslugi(o.service_type)}, status ${o.status})`,
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
      // Raporty i testy wysyłane z konta admina — nie są sprawą do obsłużenia.
      result.set(email, { fact: "", priority: "low", suggestion: "", skip: true });
    }
  }
  return result;
}

// --- karty ---------------------------------------------------------------------

// Cache na instancję funkcji: przy błędzie (np. limit Gmaila) oddajemy ostatni znany wynik.
let cache: { at: number; cards: AgentCard[] } | null = null;

export async function fetchGmailCards(admin: SupabaseClient): Promise<AgentCard[]> {
  const g = getGmailClient();
  if (!g) {
    console.warn("[agent] GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN not set — źródło Gmail wyłączone");
    return [];
  }
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.cards;

  try {
    const cards = await loadGmailCards(g, admin);
    cache = { at: Date.now(), cards };
    return cards;
  } catch (e) {
    console.warn("[agent] Gmail source failed:", e instanceof Error ? e.message : e);
    return cache?.cards ?? [];
  }
}

async function getThreadsLimited(g: gmail_v1.Gmail, ids: string[], opts: { timeout: number }) {
  const out: gmail_v1.Schema$Thread[] = [];
  for (let i = 0; i < ids.length; i += GET_CONCURRENCY) {
    const batch = await Promise.allSettled(
      ids.slice(i, i + GET_CONCURRENCY).map((id) => g.users.threads.get({ userId: "me", id, format: "full" }, opts))
    );
    for (const r of batch) {
      if (r.status === "fulfilled") out.push(r.value.data);
      else console.warn("[agent] Gmail thread skipped:", r.reason instanceof Error ? r.reason.message : r.reason);
    }
  }
  return out;
}

async function loadGmailCards(g: gmail_v1.Gmail, admin: SupabaseClient): Promise<AgentCard[]> {
  const opts = { timeout: REQUEST_TIMEOUT_MS };
  const [profile, list] = await Promise.all([
    g.users.getProfile({ userId: "me" }, opts),
    g.users.threads.list({ userId: "me", q: QUERY, maxResults: MAX_THREADS }, opts),
  ]);
  const me = (profile.data.emailAddress ?? "").toLowerCase();
  const ids = (list.data.threads ?? []).map((t) => t.id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];

  const threads = await getThreadsLimited(g, ids, opts);
  const parsed = threads
    .map((t) => parseThread(t))
    .filter((m): m is ParsedMessage => m !== null)
    .filter((m) => m.fromEmail && m.fromEmail !== me && !m.automated);
  if (parsed.length === 0) return [];

  const matches = await matchSenders(admin, Array.from(new Set(parsed.map((m) => m.fromEmail))));

  return parsed.filter((m) => !matches.get(m.fromEmail)?.skip).map((m) => {
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
      m.unread ? "Stan: nieprzeczytany, bez odpowiedzi" : "Stan: przeczytany w Gmailu, bez odpowiedzi",
    ];

    const card: AgentCard = {
      // Id karty = wątek + ostatnia wiadomość: "Później"/"done" dotyczy tej wiadomości,
      // a nowa wiadomość w tym samym wątku daje nową kartę.
      id: `mail:${m.threadId}:${m.messageId}`,
      type: "email",
      priority: match.priority,
      source: "Gmail",
      occurredAt: m.occurredAt,
      title: `${m.subject} — ${m.fromName || m.fromEmail}`,
      facts,
      suggestion: match.suggestion,
      actions: [
        { kind: "reply_email", label: "Odpisz", primary: true, payload: { threadId: m.threadId } },
        // authuser=<adres>, nie /u/0/: w przeglądarce admina konto nr 0 to zwykle prywatny Gmail, nie skrzynka portalu.
        { kind: "open", label: "Otwórz w Gmail", href: `https://mail.google.com/mail/?authuser=${encodeURIComponent(me)}#all/${m.threadId}` },
        { kind: "dismiss", label: "Później" },
      ],
    };
    return card;
  });
}

// --- odpowiedź z panelu agenta (Faza 5) -------------------------------------------

// Alias "Wyślij jako" skonfigurowany w Gmailu (SMTP Resend) — tak samo podpisane
// są ręczne odpowiedzi Wojtka do studiów.
const REPLY_FROM = "ZlecOklejanie PL <kontakt@zlecoklejanie.pl>";
const DONE_LABEL = "Agent-obsluzone";

function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

async function ensureDoneLabel(g: gmail_v1.Gmail, opts: { timeout: number }): Promise<string> {
  const list = await g.users.labels.list({ userId: "me" }, opts);
  const found = (list.data.labels ?? []).find((l) => l.name === DONE_LABEL);
  if (found?.id) return found.id;
  const created = await g.users.labels.create(
    { userId: "me", requestBody: { name: DONE_LABEL, labelListVisibility: "labelShow", messageListVisibility: "show" } },
    opts
  );
  if (!created.data.id) throw new Error("Gmail nie zwrócił id etykiety");
  return created.data.id;
}

/**
 * Odpowiedź w wątku Gmail. Adresat i temat pochodzą z OSTATNIEJ wiadomości wątku
 * (serwer), nigdy z przeglądarki. Po wysyłce wątek dostaje etykietę
 * Agent-obsluzone i znika z feedu.
 */
export async function sendGmailReply(
  threadId: string,
  text: string
): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const g = getGmailClient();
  if (!g) return { ok: false, error: "Gmail nie jest skonfigurowany na serwerze (brak GMAIL_*)." };
  const opts = { timeout: REQUEST_TIMEOUT_MS };

  const t = await g.users.threads.get(
    { userId: "me", id: threadId, format: "metadata", metadataHeaders: ["From", "Reply-To", "Subject", "Message-ID", "References"] },
    opts
  );
  const msgs = t.data.messages ?? [];
  const last = msgs[msgs.length - 1];
  if (!last) return { ok: false, error: "Wątek jest pusty." };
  const h = last.payload?.headers;
  const from = parseFrom(header(h, "From"));
  const fromDomain = from.email.split("@")[1] ?? "";
  if (SKIPPED_SENDER_DOMAIN.test(fromDomain) || AUTOMATED_SENDER.test(from.email)) {
    return { ok: false, error: "Ostatnia wiadomość w wątku jest nasza albo od automatu — nie ma komu odpisać." };
  }
  const to = parseFrom(header(h, "Reply-To") || header(h, "From")).email;
  if (!to.includes("@")) return { ok: false, error: "Nie udało się ustalić adresu nadawcy." };

  const subj = header(h, "Subject").trim();
  const subject = /^re:/i.test(subj) ? subj : `Re: ${subj || "(bez tematu)"}`;
  const messageId = header(h, "Message-ID");
  const references = [header(h, "References"), messageId].filter(Boolean).join(" ");

  const mime = [
    `From: ${REPLY_FROM}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    ...(messageId ? [`In-Reply-To: ${messageId}`, `References: ${references}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(text, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");

  await g.users.messages.send(
    { userId: "me", requestBody: { raw: Buffer.from(mime, "utf8").toString("base64url"), threadId } },
    opts
  );

  // Etykieta i "przeczytane" są dodatkiem — mail już poszedł, błąd tu nie cofa sukcesu.
  try {
    const labelId = await ensureDoneLabel(g, opts);
    await g.users.threads.modify(
      { userId: "me", id: threadId, requestBody: { addLabelIds: [labelId], removeLabelIds: ["UNREAD"] } },
      opts
    );
  } catch (e) {
    console.warn("[agent] Gmail label/modify failed:", e instanceof Error ? e.message : e);
  }
  cache = null;
  return { ok: true, to };
}

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024;
const UA = "Mozilla/5.0 (compatible; ZlecOklejanieBot/1.0; +https://zlecoklejanie.pl)";

// Ochrona przed SSRF: tylko publiczne adresy http(s), bez localhost/sieci prywatnych.
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const l = ip.toLowerCase();
    return l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:127.") || l.startsWith("::ffff:10.") || l.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
  );
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const u = new URL(raw);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Zły protokół.");
  const host = u.hostname;
  if (host === "localhost" || host.endsWith(".local")) throw new Error("Adres lokalny.");
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((r) => r.address);
  if (ips.length === 0 || ips.some(isPrivateIp)) throw new Error("Adres prywatny.");
  return u;
}

async function fetchLimited(url: string, init?: RequestInit) {
  const u = await assertPublicUrl(url);
  return fetch(u, {
    ...init,
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "user-agent": UA, accept: "text/html,image/*;q=0.8", ...(init?.headers || {}) },
  });
}

function pickMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`,
      "i"
    );
    const m = html.match(re);
    const v = m?.[1] || m?.[2];
    if (v) return v.replace(/&amp;/g, "&").trim();
  }
  return null;
}

/** Zwraca bezwzględny URL og:image / twitter:image ze strony albo null. */
export async function fetchOgImage(website: string): Promise<string | null> {
  const start = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const res = await fetchLimited(start);
  if (!res.ok) return null;
  const buf = await res.arrayBuffer();
  const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_HTML_BYTES));
  const raw = pickMeta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
  if (!raw) return null;
  let abs: string;
  try {
    abs = new URL(raw, res.url).toString();
  } catch {
    return null;
  }
  if (!abs.startsWith("https://")) return null; // http zablokuje mixed-content na stronie
  // Sprawdź, że to faktycznie obraz i że da się go pobrać.
  const head = await fetchLimited(abs, { method: "GET", headers: { range: "bytes=0-1023" } });
  const type = head.headers.get("content-type") || "";
  return head.ok && type.startsWith("image/") ? abs : null;
}

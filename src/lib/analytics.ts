// Analityka stron PUBLICZNYCH (katalog /wykonawcy, profile /wykonawca/*) — tylko po zgodzie.
// Lustro assets/analytics.js z landingu (repo zlecoklejanie). TEN SAM klucz localStorage
// `zlec_cookie_consent` ('granted' | 'denied'): landing i aplikacja są pod jedną domeną
// (zlecoklejanie.pl), więc zgoda z landingu działa w katalogu. Zmieniasz tu — zmień też tam.
//
// Zasada z CLAUDE.md: analityka wyłącznie po zgodzie, NIGDY w panelach (/admin, /studio,
// /klient, /grafik) — dlatego komponent PublicAnalytics jest tylko w layoutach
// src/app/wykonawcy i src/app/wykonawca.

export const CONSENT_KEY = "zlec_cookie_consent";
const GA_MEASUREMENT_ID = "G-0PBM1QFP0L";
const CLARITY_ID = "y9anr0myh0";

export type Consent = "granted" | "denied";

type Win = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[] };
  __zlecGaLoaded?: boolean;
  __zlecClarityLoaded?: boolean;
  [k: `ga-disable-${string}`]: boolean;
};

const w = (): Win => window as unknown as Win;

export function readConsent(): Consent | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(choice: Consent): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* tryb prywatny / zablokowany storage — wybór działa do końca sesji strony */
  }
}

function ensureGtag(): void {
  const win = w();
  win.dataLayer = win.dataLayer || [];
  if (!win.gtag) {
    win.gtag = function () {
      // gtag wymaga obiektu `arguments`, nie tablicy
      // eslint-disable-next-line prefer-rest-params
      (win.dataLayer as unknown[]).push(arguments);
    };
    win.gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  }
}

function loadGA(): void {
  const win = w();
  if (win.__zlecGaLoaded) return;
  win.__zlecGaLoaded = true;
  ensureGtag();
  win[`ga-disable-${GA_MEASUREMENT_ID}`] = false;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);

  win.gtag!("consent", "update", {
    ad_storage: "denied", // reklam nie używamy
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  win.gtag!("js", new Date());
  win.gtag!("config", GA_MEASUREMENT_ID, { anonymize_ip: true, allow_google_signals: false });
}

function loadClarity(): void {
  const win = w();
  if (win.__zlecClarityLoaded) return;
  win.__zlecClarityLoaded = true;
  const c = win as unknown as Record<string, unknown>;
  c.clarity =
    c.clarity ||
    function (...args: unknown[]) {
      const f = win.clarity as ((...a: unknown[]) => void) & { q?: unknown[] };
      (f.q = f.q || []).push(args);
    };
  const t = document.createElement("script");
  t.async = true;
  t.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  document.head.appendChild(t);
  // Consent API v2 — reklam nie używamy
  win.clarity!("consentv2", { ad_Storage: "denied", analytics_Storage: "granted" });
}

function deleteCookie(name: string): void {
  const host = location.hostname;
  const parts = host.split(".");
  const domains = [host, `.${host}`];
  if (parts.length > 2) domains.push(`.${parts.slice(-2).join(".")}`);
  for (const d of domains) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${d}`;
  }
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function stopTracking(): void {
  const win = w();
  win[`ga-disable-${GA_MEASUREMENT_ID}`] = true;
  if (win.gtag) {
    win.gtag("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
  }
  if (typeof win.clarity === "function") {
    win.clarity("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" });
    win.clarity("consent", false); // Clarity kasuje swoje ciasteczka
  }
  for (const c of document.cookie.split(";")) {
    const n = c.split("=")[0].trim();
    if (/^(_ga|_gid|_gat|_clck|_clsk|CLID|ANONCHK|MR|MUID|SM)/.test(n)) deleteCookie(n);
  }
}

/** Stosuje wybór: 'granted' ładuje GA4 + Clarity, 'denied' przerywa i czyści ciasteczka. */
export function applyConsent(choice: Consent): void {
  if (choice === "granted") {
    loadGA();
    loadClarity();
  } else {
    stopTracking();
  }
}

/** Zdarzenie GA4 — tylko przy zgodzie; bez zgody no-op. */
export function track(event: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  if (readConsent() !== "granted") return;
  const win = w();
  if (!win.gtag) return;
  win.gtag("event", event, params ?? {});
}

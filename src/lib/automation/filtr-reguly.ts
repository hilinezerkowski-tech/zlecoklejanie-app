// Czyste reguły filtra zgłoszeń klientów (Etap 7, Faza 3) — bez importów, żeby dało
// się je sprawdzić samym Node'em (scripts/check-filtr.mjs). Baza i logi: filtr-zgloszen.ts.
//
// Filtr NIE odrzuca zgłoszeń — tylko oznacza je jako wyjątek do ręcznej decyzji.
// Dlatego reguły są ostrożne: lepiej przepuścić podejrzane do karty niż schować klienta.

/** Telefon do porównań: same cyfry, bez prefiksu kraju PL. "+48 600-100-200" → "600100200". */
export function normalizujTelefon(raw: string | null | undefined): string {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("0048")) d = d.slice(4);
  else if (d.startsWith("48") && d.length === 11) d = d.slice(2);
  return d;
}

/** Dwa numery to ten sam numer, gdy zgadza się 9 ostatnich cyfr (od 9 cyfr wzwyż). */
export function tenSamTelefon(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizujTelefon(a);
  const y = normalizujTelefon(b);
  if (x.length < 9 || y.length < 9) return false;
  return x.slice(-9) === y.slice(-9);
}

export function normalizujEmail(raw: string | null | undefined): string {
  return (raw || "").trim().toLowerCase();
}

// Link w polach tekstowych. Domeny .pl celowo pominięte (klient może wkleić np. ogłoszenie).
const LINK = /(https?:\/\/|www\.|\[url|<a\s)|\b[a-z0-9-]+\.(com|net|org|ru|xyz|top|click|info|biz|io|shop|site|online|live)\b/i;

/** Telefon podany, ale nie wygląda na numer. Pusty telefon jest OK (pole opcjonalne). */
function zlyTelefon(raw: string | null | undefined): boolean {
  const t = (raw || "").trim();
  if (!t) return false;
  if (/[a-ząćęłńóśźż]/i.test(t)) return true;
  const d = normalizujTelefon(t);
  if (d.length < 9 || d.length > 15) return true;
  if (/^(\d)\1+$/.test(d)) return true; // 111111111
  if ("01234567890".includes(d) || "98765432109".includes(d)) return true; // 123456789
  return false;
}

/**
 * Powody, dla których zgłoszenie wygląda na spam. Pusta lista = brak podejrzeń.
 * `emailOk` liczy wołający (isValidEmail z @/lib/email) — tu bez importów.
 *
 * Brak reguły „puste imię” z briefu: formularz klienta w ogóle nie ma pola imienia.
 */
export function powodySpamu(p: Record<string, unknown>, emailOk: boolean): string[] {
  const powody: string[] = [];
  const tekst = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");

  if (!emailOk) powody.push("brak poprawnego adresu e-mail");
  if (zlyTelefon(tekst("telefon"))) powody.push("telefon w nieprawidłowym formacie");
  const zLinkiem = ["szczegoly", "auto", "miasto"].filter((k) => LINK.test(tekst(k)));
  if (zLinkiem.length > 0) powody.push(`link w treści (${zLinkiem.join(", ")})`);

  return powody;
}

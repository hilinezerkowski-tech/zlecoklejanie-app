// Miasto i slug miasta wyliczane z pola studios.address.
// Adresy mają spójny format "KK-KKK Miasto" (np. "51-416 Wrocław")
// lub "ul. X 1, KK-KKK Miasto". Wyciągamy człon po kodzie pocztowym.

const PL_MAP: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "a", Ć: "c", Ę: "e", Ł: "l", Ń: "n", Ó: "o", Ś: "s", Ź: "z", Ż: "z",
};

export function slugifyPl(v: string): string {
  return (v || "")
    .split("")
    .map((c) => PL_MAP[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Wyciąga nazwę miasta z adresu. Zwraca null, gdy nie da się ustalić.
export function cityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  let s = address.trim();
  // Weź fragment po ostatnim przecinku, jeśli jest (ul. X, 00-000 Miasto)
  if (s.includes(",")) s = s.split(",").pop()!.trim();
  // Usuń kod pocztowy z początku
  s = s.replace(/^\d{2}-\d{3}\s*/, "").trim();
  // Usuń ewentualne dopiski województwa po myślniku/nawiasie
  s = s.replace(/\s*[-(].*$/, "").trim();
  if (!s || /^\d/.test(s)) return null;
  // Kapitalizacja pierwszej litery każdego członu (Tarnowskie Góry)
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function citySlug(city: string | null | undefined): string | null {
  const c = cityFromAddress(city) ?? (city || null);
  return c ? slugifyPl(c) : null;
}

// Lekkie helpery kodu pocztowego — bez danych, można ich używać w komponentach klienckich.
// Geokodowanie po kodzie (z bazą współrzędnych) jest w geo.ts, tylko po stronie serwera.

// Wyciąga kod pocztowy z tekstu ("ul. Długa 48, 05-090 Raszyn" -> "05-090").
// Wymaga myślnika, żeby nie łapać numerów domów. Sam 5-cyfrowy tekst też przejdzie.
export function kodZTekstu(tekst: string | null | undefined): string | null {
  if (!tekst) return null;
  const m = tekst.match(/(?:^|[^\d])(\d{2})-(\d{3})(?!\d)/) || tekst.trim().match(/^(\d{2})(\d{3})$/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// Normalizacja kodu z formularza: "05090" / "05 090" / "05-090" -> "05-090".
// Zwraca null dla pustego pola, "" dla błędnego formatu.
export function normalizujKod(kod: string | null | undefined): string | null {
  const c = (kod || "").replace(/\s/g, "");
  if (!c) return null;
  const m = c.match(/^(\d{2})-?(\d{3})$/);
  return m ? `${m[1]}-${m[2]}` : "";
}

// Dokleja kod do adresu przed ostatnim członem: "ul. Długa 48, Łady" + "05-090"
// -> "ul. Długa 48, 05-090 Łady". Adres z kodem zostaje bez zmian.
export function adresZKodem(adres: string | null | undefined, kod: string | null | undefined): string {
  const a = (adres || "").trim();
  const k = normalizujKod(kod);
  if (!k || kodZTekstu(a)) return a;
  if (!a) return k;
  const i = a.lastIndexOf(",");
  return i === -1 ? `${k} ${a}` : `${a.slice(0, i + 1)} ${k} ${a.slice(i + 1).trim()}`;
}

// Kontrola reguł automatycznego przypisania (src/lib/automation/auto-reguly.ts).
// Uruchom: node scripts/check-automat.mjs   (Node ≥ 23.6 — czyta .ts bez kompilacji)

import { wybierzStudia, toHiline } from "../src/lib/automation/auto-reguly.ts";

let bledy = 0;
function sprawdz(opis, wynik, oczekiwane) {
  const ok = JSON.stringify(wynik) === JSON.stringify(oczekiwane);
  if (!ok) bledy++;
  console.log(`${ok ? "OK  " : "BŁĄD"} ${opis}${ok ? "" : ` → ${JSON.stringify(wynik)}, oczekiwane ${JSON.stringify(oczekiwane)}`}`);
}

const s = (id, km, pasuje = true, nazwa = `Studio ${id}`, slug = `studio-${id}`) => ({ id, nazwa, slug, km, pasuje });
const hiline = { id: "H", nazwa: "Hiline Wrap & Detailing", slug: "hiline-wrap-detailing", km: 5, pasuje: true };
const opts = { promienKm: 50, max: 3, miastoRozpoznane: true };
const ids = (d) => (d.przypisz ? d.studia.map((x) => x.id) : d.powod);

sprawdz("3 najbliższe z 5 pasujących", ids(wybierzStudia([s("a", 40), s("b", 5), s("c", 12), s("d", 30), s("e", 8)], opts)), ["b", "e", "c"]);
sprawdz("niepasujące odpada mimo bliskości", ids(wybierzStudia([s("a", 1, false), s("b", 20)], opts)), ["b"]);
sprawdz("poza promieniem odpada", ids(wybierzStudia([s("a", 51), s("b", 50)], opts)), ["b"]);
sprawdz("studio bez rozpoznanej miejscowości odpada", ids(wybierzStudia([s("a", null), s("b", 10)], opts)), ["b"]);
sprawdz("brak kandydatów", ids(wybierzStudia([s("a", 80)], opts)), "brak pasujących studiów w promieniu 50 km");
sprawdz("nierozpoznane miasto zlecenia", ids(wybierzStudia([s("a", null)], { ...opts, miastoRozpoznane: false })), "nie rozpoznano miejscowości zlecenia");
sprawdz("Hiline jedyny = wyjątek", ids(wybierzStudia([hiline, s("a", 90)], opts)), "jedynym pasującym studiem jest Hiline — nigdy jedyna propozycja");
sprawdz("Hiline + inne studio = OK", ids(wybierzStudia([hiline, s("a", 30)], opts)), ["H", "a"]);
sprawdz("wskazany wykonawca", ids(wybierzStudia([s("a", 5), s("b", 300)], { ...opts, wykonawcaSlug: "studio-b" })), ["b"]);
sprawdz("wskazany wykonawca nie robi usługi", ids(wybierzStudia([s("b", 3, false)], { ...opts, wykonawcaSlug: "studio-b" })), "klient wybrał wykonawcę „studio-b”, który nie robi tej usługi albo jest niedostępny");
sprawdz("klient wskazał Hiline = OK", ids(wybierzStudia([hiline], { ...opts, wykonawcaSlug: "hiline-wrap-detailing" })), ["H"]);
sprawdz("rozpoznawanie Hiline po nazwie", toHiline({ nazwa: "HILINE", slug: null }), true);
sprawdz("inne studio to nie Hiline", toHiline({ nazwa: "Wrap Kraków", slug: "wrap-krakow" }), false);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko OK");
process.exit(bledy ? 1 : 0);

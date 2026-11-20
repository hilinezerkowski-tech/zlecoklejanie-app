// Kontrola reguł automatycznego przypisania (src/lib/automation/auto-reguly.ts).
// Uruchom: node scripts/check-automat.mjs   (Node ≥ 23.6 — czyta .ts bez kompilacji)

import { wybierzStudia, toHiline, uszereguj } from "../src/lib/automation/auto-reguly.ts";
import { oczyscPromienie } from "../src/lib/automation/ustawienia.ts";

let bledy = 0;
function sprawdz(opis, wynik, oczekiwane) {
  const ok = JSON.stringify(wynik) === JSON.stringify(oczekiwane);
  if (!ok) bledy++;
  console.log(`${ok ? "OK  " : "BŁĄD"} ${opis}${ok ? "" : ` → ${JSON.stringify(wynik)}, oczekiwane ${JSON.stringify(oczekiwane)}`}`);
}

const s = (id, km, pasuje = true, nazwa = `Studio ${id}`, slug = `studio-${id}`) => ({ id, nazwa, slug, km, pasuje });
const hiline = { id: "H", nazwa: "Hiline Wrap & Detailing", slug: "hiline-wrap-detailing", km: 5, pasuje: true };
const BEZ_LOSOWANIA = () => 0.9999; // Fisher-Yates bez zamian = kolejność wg km
const opts = { promienie: [50], max: 3, miastoRozpoznane: true, losuj: BEZ_LOSOWANIA };
const ids = (d) => (d.przypisz ? d.studia.map((x) => x.id) : d.powod);

sprawdz("3 najbliższe z 5 pasujących", ids(wybierzStudia([s("a", 40), s("b", 5), s("c", 12), s("d", 30), s("e", 8)], opts)), ["b", "e", "c"]);
sprawdz("niepasujące odpada mimo bliskości", ids(wybierzStudia([s("a", 1, false), s("b", 20)], opts)), ["b"]);
sprawdz("poza promieniem odpada", ids(wybierzStudia([s("a", 51), s("b", 50)], opts)), ["b"]);
sprawdz("studio bez rozpoznanej miejscowości odpada", ids(wybierzStudia([s("a", null), s("b", 10)], opts)), ["b"]);
sprawdz("brak kandydatów", ids(wybierzStudia([s("a", 80)], opts)), "brak studiów nawet w promieniu 50 km");
sprawdz("nierozpoznane miasto zlecenia", ids(wybierzStudia([s("a", null)], { ...opts, miastoRozpoznane: false })), "nie rozpoznano miejscowości zlecenia");
sprawdz("Hiline jedyny = wyjątek", ids(wybierzStudia([hiline, s("a", 90)], opts)), "jedynym pasującym studiem w promieniu 50 km jest Hiline — nigdy jedyna propozycja");
sprawdz("Hiline + inne studio = OK", ids(wybierzStudia([hiline, s("a", 30)], opts)), ["H", "a"]);
sprawdz("wskazany wykonawca", ids(wybierzStudia([s("a", 5), s("b", 300)], { ...opts, wykonawcaSlug: "studio-b" })), ["b"]);
sprawdz("wskazany wykonawca nie robi usługi", ids(wybierzStudia([s("b", 3, false)], { ...opts, wykonawcaSlug: "studio-b" })), "klient wybrał wykonawcę „studio-b”, który nie robi tej usługi albo jest niedostępny");
sprawdz("klient wskazał Hiline = OK", ids(wybierzStudia([hiline], { ...opts, wykonawcaSlug: "hiline-wrap-detailing" })), ["H"]);
sprawdz("rozpoznawanie Hiline po nazwie", toHiline({ nazwa: "HILINE", slug: null }), true);
sprawdz("inne studio to nie Hiline", toHiline({ nazwa: "Wrap Kraków", slug: "wrap-krakow" }), false);

// --- Faza 2: ranking ---
const z = (id, km, obciazenie) => ({ ...s(id, km), obciazenie });
const kol = (lista) => uszereguj(lista, BEZ_LOSOWANIA).map((k) => k.id);
sprawdz("remis km: mniej obciążone wyżej", kol([z("a", 5, 3), z("b", 9, 0)]), ["b", "a"]);
sprawdz("poza remisem odległość wygrywa z obciążeniem", kol([z("a", 5, 5), z("b", 20, 0)]), ["a", "b"]);
sprawdz("grupa remisu liczona od pierwszego (0, 9 | 18)", kol([z("c", 18, 0), z("b", 9, 2), z("a", 0, 1)]), ["a", "b", "c"]);
sprawdz("brak danych o obciążeniu = 0", kol([z("a", 3, 1), s("b", 6)]), ["b", "a"]);

// Bramka 2 na regułach: 3 pasujące studia w jednym mieście, 30 zleceń — pierwsze miejsce się zmienia.
const krakow = [z("x", 4, 0), z("y", 4, 0), z("w", 7, 0)];
const pierwsze = new Set();
for (let i = 0; i < 30; i++) {
  const d = wybierzStudia(krakow, { promienie: [50], max: 3, miastoRozpoznane: true });
  pierwsze.add(d.studia[0].id);
}
sprawdz("rotacja: różne studia na 1. miejscu w 30 zleceniach", pierwsze.size > 1, true);
sprawdz("rotacja nie gubi studiów (zawsze 3)", wybierzStudia(krakow, { promienie: [50], max: 3, miastoRozpoznane: true }).studia.length, 3);

// --- Faza 4: geo-fallback ---
const geo = { promienie: [50, 100, 200], max: 3, miastoRozpoznane: true, usluga: "Zmiana koloru", losuj: BEZ_LOSOWANIA };
const zPromieniem = (d) => (d.przypisz ? `${d.studia.map((x) => x.id).join(",")} @${d.promienKm} km` : d.powod);
sprawdz("bramka 4: nic w 50 km, jedno w 120 km → 200", zPromieniem(wybierzStudia([s("a", 120)], geo)), "a @200 km");
sprawdz("studio w 90 km → promień 100", zPromieniem(wybierzStudia([s("a", 90)], geo)), "a @100 km");
sprawdz("jest ktoś w 50 km → dalej nie szukamy", zPromieniem(wybierzStudia([s("a", 30), s("b", 90)], geo)), "a @50 km");
sprawdz("nic nawet w 200 km", zPromieniem(wybierzStudia([s("a", 250)], geo)), "brak studiów z usługą „Zmiana koloru” nawet w promieniu 200 km");
sprawdz("tylko Hiline w 50 km → szukamy drugiego dalej", zPromieniem(wybierzStudia([hiline, s("a", 90)], geo)), "H,a @100 km");
sprawdz("tylko Hiline w całym 200 km → wyjątek", zPromieniem(wybierzStudia([hiline, s("a", 300)], geo)), "jedynym pasującym studiem w promieniu 200 km jest Hiline — nigdy jedyna propozycja");
sprawdz("promienie w dowolnej kolejności", zPromieniem(wybierzStudia([s("a", 90)], { ...geo, promienie: [200, 50, 100] })), "a @100 km");

// --- Faza 4: walidacja promieni z /admin/ustawienia ---
sprawdz("promienie OK", oczyscPromienie([50, 100, 200]), [50, 100, 200]);
sprawdz("jeden promień OK", oczyscPromienie([80]), [80]);
sprawdz("tekst z formularza OK", oczyscPromienie(["50", "120"]), [50, 120]);
sprawdz("malejące = błąd", oczyscPromienie([100, 50]), null);
sprawdz("powtórzone = błąd", oczyscPromienie([50, 50]), null);
sprawdz("zero = błąd", oczyscPromienie([0, 10]), null);
sprawdz("ponad 500 km = błąd", oczyscPromienie([600]), null);
sprawdz("4 progi = błąd", oczyscPromienie([50, 100, 200, 300]), null);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko OK");
process.exit(bledy ? 1 : 0);

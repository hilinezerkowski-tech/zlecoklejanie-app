// Kontrola reguł filtra zgłoszeń (src/lib/automation/filtr-reguly.ts).
// Uruchom: node scripts/check-filtr.mjs   (Node ≥ 23.6 — czyta .ts bez kompilacji)

import { normalizujTelefon, tenSamTelefon, powodySpamu } from "../src/lib/automation/filtr-reguly.ts";

let bledy = 0;
function sprawdz(opis, wynik, oczekiwane) {
  const ok = JSON.stringify(wynik) === JSON.stringify(oczekiwane);
  if (!ok) bledy++;
  console.log(`${ok ? "OK  " : "BŁĄD"} ${opis}${ok ? "" : ` → ${JSON.stringify(wynik)}, oczekiwane ${JSON.stringify(oczekiwane)}`}`);
}

sprawdz("telefon +48 z myślnikami", normalizujTelefon("+48 600-100-200"), "600100200");
sprawdz("telefon 0048", normalizujTelefon("0048600100200"), "600100200");
sprawdz("ten sam numer w dwóch zapisach", tenSamTelefon("600 100 200", "+48600100200"), true);
sprawdz("różne numery", tenSamTelefon("600100200", "600100201"), false);
sprawdz("pusty numer nigdy nie jest duplikatem", tenSamTelefon("", ""), false);

const ok = { auto: "BMW X5 G05 2023", miasto: "Kraków", szczegoly: "Pełna zmiana koloru, termin do końca miesiąca.", telefon: "600 100 200" };
sprawdz("normalne zgłoszenie", powodySpamu(ok, true), []);
sprawdz("bez telefonu (pole opcjonalne)", powodySpamu({ ...ok, telefon: "" }, true), []);
sprawdz("numer zagraniczny", powodySpamu({ ...ok, telefon: "+49 151 23456789" }, true), []);
sprawdz("zły e-mail", powodySpamu(ok, false), ["brak poprawnego adresu e-mail"]);
sprawdz("telefon z literami", powodySpamu({ ...ok, telefon: "zadzwoń wieczorem" }, true), ["telefon w nieprawidłowym formacie"]);
sprawdz("telefon 111111111", powodySpamu({ ...ok, telefon: "111111111" }, true), ["telefon w nieprawidłowym formacie"]);
sprawdz("telefon 123456789", powodySpamu({ ...ok, telefon: "123 456 789" }, true), ["telefon w nieprawidłowym formacie"]);
sprawdz("za krótki telefon", powodySpamu({ ...ok, telefon: "60010" }, true), ["telefon w nieprawidłowym formacie"]);
sprawdz("link http w szczegółach", powodySpamu({ ...ok, szczegoly: "Tanie kredyty https://x.example" }, true), ["link w treści (szczegoly)"]);
sprawdz("domena .com w aucie", powodySpamu({ ...ok, auto: "best-seo.com" }, true), ["link w treści (auto)"]);
sprawdz("link do ogłoszenia .pl przechodzi", powodySpamu({ ...ok, szczegoly: "auto z otomoto.pl, kolor jak na zdjęciu" }, true), []);
sprawdz("Tesla Model 3 to nie domena", powodySpamu({ ...ok, auto: "Tesla Model 3" }, true), []);

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko OK");
process.exit(bledy ? 1 : 0);

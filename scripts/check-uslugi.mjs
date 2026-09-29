// Kontrola mapowań słownika usług (src/lib/uslugi.ts). Bez zależności:
//   node scripts/check-uslugi.mjs
// Node >= 23.6 importuje .ts wprost (type stripping). Kończy się kodem 1 przy błędzie.
// Ostrzeżenie MODULE_TYPELESS_PACKAGE_JSON jest nieszkodliwe (repo nie ma "type": "module").

import {
  USLUGI,
  CORE_CODES,
  KODY_ZLECEN,
  labelUslugi,
  mapLandingUsluga,
  mapLandingCheckboxy,
  studioPasuje,
  maUslugeCore,
} from "../src/lib/uslugi.ts";

let bledy = 0;
function eq(opis, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) {
    bledy++;
    console.error(`✗ ${opis}\n    jest:     ${g}\n    powinno:  ${w}`);
  }
}

// 1. Słownik
eq("8 usług w słowniku", USLUGI.length, 8);
eq("detailing nie jest core", CORE_CODES.includes("detailing"), false);
eq("7 usług core", CORE_CODES.length, 7);
eq("kody zleceń", KODY_ZLECEN, ["zmiana_koloru", "detale", "dechrom", "ppf", "ppf_kolor", "reklama", "szyby", "grafika", "inne"]);

// 2. Select klienta `usluga` — wszystkie opcje z landingu (index + uslugi/*.html)
const SELECT = {
  "Zmiana koloru (wrap)": "zmiana_koloru",
  "Folia ochronna PPF": "ppf",
  "PPF kolorowy": "ppf_kolor",
  "Oklejenie reklamowe": "reklama",
  "Branding floty": "reklama",
  "Projekt graficzny": "grafika",
  "Detale (dach, maska, lusterka)": "detale",
  "Inne": "inne",
  // nowe opcje (Faza 4)
  "Dechroming": "dechrom",
  "Przyciemnianie szyb": "szyby",
  // brzegowe
  "": "inne",
  "coś zupełnie innego": "inne",
};
for (const [tekst, kod] of Object.entries(SELECT)) eq(`mapLandingUsluga(${JSON.stringify(tekst)})`, mapLandingUsluga(tekst), kod);
eq("mapLandingUsluga(undefined)", mapLandingUsluga(undefined), "inne");

// 3. Checkboxy wykonawcy — stare i nowe nazwy
eq(
  "stare checkboxy studia",
  mapLandingCheckboxy({ usl_wrap: "tak", usl_ppf: "tak", usl_reklama: "tak", usl_szyby: "tak", usl_mobilnie: "tak" }),
  { services: ["zmiana_koloru", "ppf", "reklama", "szyby"], uKlienta: true }
);
eq("stary usl_dechrom wrappera nie ginie", mapLandingCheckboxy({ usl_dechrom: "tak" }), { services: ["dechrom"], uKlienta: false });
eq(
  "nowe checkboxy usl_<kod>",
  mapLandingCheckboxy({ usl_detale: "tak", usl_ppf_kolor: "on", usl_detailing: "tak", usl_zmiana_koloru: "tak" }),
  { services: ["zmiana_koloru", "detale", "ppf_kolor", "detailing"], uKlienta: false }
);
eq("stary i nowy na tę samą usługę bez duplikatu", mapLandingCheckboxy({ usl_wrap: "tak", usl_zmiana_koloru: "tak" }).services, ["zmiana_koloru"]);
eq("nic nie zaznaczone", mapLandingCheckboxy({ nazwa: "X", usl_ppf: "" }), { services: [], uKlienta: false });
eq("sam dojazd = brak usług core", maUslugeCore(mapLandingCheckboxy({ usl_mobilnie: "tak" }).services), false);
eq("sam detailing = brak usług core", maUslugeCore(["detailing"]), false);

// 4. Stare wartości przy odczycie
eq("label oklejanie", labelUslugi("oklejanie"), "Oklejanie (zmiana koloru)");
eq("label branding", labelUslugi("branding"), "Oklejanie reklamowe i branding flot");
eq("label ppf", labelUslugi("ppf"), "PPF bezbarwny (ochrona lakieru)");
eq("label nieznany", labelUslugi("xyz"), "xyz");
eq("label null", labelUslugi(null), "—");

// 5. Dopasowanie studia do zlecenia
eq("Mini F56 zmiana koloru → One Man Army (ppf+detailing)", studioPasuje(["ppf", "detailing"], "zmiana_koloru"), "nie_robi");
eq("zmiana koloru → studio z zmiana_koloru", studioPasuje(["zmiana_koloru", "ppf"], "zmiana_koloru"), "pasuje");
eq("detale → studio z zmiana_koloru (reguła zgodności)", studioPasuje(["zmiana_koloru"], "detale"), "pasuje");
eq("zmiana koloru → studio tylko z detale (w drugą stronę nie)", studioPasuje(["detale"], "zmiana_koloru"), "nie_robi");
eq("ppf_kolor ściśle", studioPasuje(["ppf"], "ppf_kolor"), "nie_robi");
eq("studio bez usług", studioPasuje([], "ppf"), "brak_uslug");
eq("studio z samym detailingiem", studioPasuje(["detailing"], "ppf"), "brak_uslug");
eq("studio null", studioPasuje(null, "ppf"), "brak_uslug");
eq("zlecenie grafika bez filtra", studioPasuje(["ppf"], "grafika"), "bez_filtra");
eq("zlecenie inne bez filtra", studioPasuje([], "inne"), "bez_filtra");
eq("stare zlecenie oklejanie", studioPasuje(["zmiana_koloru"], "oklejanie"), "pasuje");
eq("stare zlecenie branding", studioPasuje(["reklama"], "branding"), "pasuje");

if (bledy > 0) {
  console.error(`\n${bledy} błąd(ów) w mapowaniu usług.`);
  process.exit(1);
}
console.log("✓ check-uslugi: wszystkie mapowania OK");

// Faza 1c briefu uslugi-studiow-brief.md — automapowanie JEDNOZNACZNE starych
// studios.specializations (wolny tekst) na studios.services (słownik src/lib/uslugi.ts).
//
//   node scripts/automapowanie-uslug.mjs <plik-wejściowy> [--sql out.sql] [--md out.md]
//
// Wejście: po jednym studiu w linii: `id || status || nazwa || spec1 ;; spec2 ;; …`
// (eksport z /admin/studia). Wyjście: tabela podglądu (markdown) i SQL z UPDATE
// po id — do przejrzenia i odpalenia przez Wojtka. Skrypt niczego nie zapisuje w bazie.
//
// Zasady:
// - reguły deterministyczne na tekście bez polskich znaków, małymi literami, addytywnie;
// - „zmiana koloru PPF” / „zmiana koloru / PPF” łapie i zmianę koloru, i PPF kolorowy
//   → wiersz „do sprawdzenia”, UPDATE tylko w komentarzu;
// - sam „oklejanie” bez dopowiedzenia i pusta lista → zostaje puste (Faza 5);
// - studios.specializations zostaje bez zmian (to teraz „Inne usługi (opis)”).

import { readFileSync, writeFileSync } from "node:fs";

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/\s+/g, " ").trim();

const RE = {
  ppf_kolor: /kolorow\w* ppf|ppf kolor|zmiana kolor\w* (\/ )?ppf|ppf \(? ?bezbarwn\w* i kolorow/,
  zmiana_koloru: /zmiana kolor|full wrap|\bwrap\b|vinyl/,
  ppf: /ppf|folie ochronne|folia ochronna/,
  reklama: /reklam|brand|flot/,
  szyby: /szyb|okien/,
  dechrom: /dechrom/,
  detale: /\bdetal(e|i)\b/,
  detailing: /detailing|ceramik|powlok|korekt|polerow|renowacja lakieru/,
  u_klienta: /dojazd/,
};

const KOLEJNOSC = ["zmiana_koloru", "detale", "dechrom", "ppf", "ppf_kolor", "reklama", "szyby", "detailing"];
const CORE = KOLEJNOSC.filter((k) => k !== "detailing");

export function automapuj(specs) {
  const out = new Set();
  let uKlienta = false;
  const konflikty = [];
  const nierozpoznane = [];
  for (const raw of specs) {
    const e = norm(raw);
    if (!e) continue;
    const hit = (k) => RE[k].test(e);
    let trafione = false;
    if (hit("ppf_kolor")) {
      out.add("ppf_kolor");
      trafione = true;
      if (/bezbarwn/.test(e)) out.add("ppf");
      // „zmiana koloru PPF” — kolorowy PPF czy folia + PPF? Decyduje Wojtek.
      if (hit("zmiana_koloru")) konflikty.push(raw);
    } else {
      if (hit("zmiana_koloru")) (out.add("zmiana_koloru"), (trafione = true));
      if (hit("ppf")) (out.add("ppf"), (trafione = true));
    }
    for (const k of ["reklama", "szyby", "dechrom", "detale", "detailing"]) {
      if (hit(k)) (out.add(k), (trafione = true));
    }
    if (hit("u_klienta")) (uKlienta = true), (trafione = true);
    if (!trafione) nierozpoznane.push(raw);
  }
  const services = KOLEJNOSC.filter((k) => out.has(k));
  return {
    services,
    uKlienta,
    doSprawdzenia: konflikty.length > 0,
    konflikty,
    nierozpoznane,
    maCore: services.some((s) => CORE.includes(s)),
  };
}

function parse(plik) {
  return readFileSync(plik, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const [id, status, nazwa, spec = ""] = l.split(/\s*\|\|\s*/);
      return {
        id: id.trim(),
        status: status.trim(),
        nazwa: nazwa.trim(),
        spec: spec.split(" ;; ").map((s) => s.trim()).filter(Boolean),
      };
    });
}

const sqlArr = (a) => `ARRAY[${a.map((s) => `'${s}'`).join(", ")}]::TEXT[]`;
const sqlKom = (s) => s.replace(/\r?\n/g, " ").replace(/\*\//g, "* /");

function main() {
  const args = process.argv.slice(2);
  const plik = args[0];
  if (!plik) {
    console.error("Użycie: node scripts/automapowanie-uslug.mjs <plik> [--sql out.sql] [--md out.md]");
    process.exit(1);
  }
  const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  const studia = parse(plik).map((s) => ({ ...s, wynik: automapuj(s.spec) }));

  const md = ["| # | Studio | Obecny opis (specializations) | Proponowane services | Dojazd | Status |", "|---|---|---|---|---|---|"];
  studia.forEach((s, i) => {
    const w = s.wynik;
    const stan = !s.spec.length
      ? "puste — Faza 5"
      : w.doSprawdzenia
        ? `⚠ do sprawdzenia: ${w.konflikty.join(", ")}`
        : !w.maCore
          ? "brak usługi core — Faza 5"
          : "auto";
    md.push(
      `| ${i + 1} | ${s.nazwa.replace(/\|/g, "/")} | ${s.spec.join("; ").replace(/\|/g, "/") || "—"} | ${w.services.join(", ") || "—"} | ${w.uKlienta ? "tak" : ""} | ${stan} |`
    );
  });

  const auto = studia.filter((s) => s.spec.length && !s.wynik.doSprawdzenia && s.wynik.services.length);
  const recz = studia.filter((s) => s.wynik.doSprawdzenia);
  const dojazd = studia.filter((s) => s.wynik.uKlienta && !s.wynik.doSprawdzenia);

  const sql = [
    "-- =============================================",
    "-- 025_uslugi_automapowanie.sql",
    "-- Faza 1c: jednoznaczne przepisanie studios.specializations → studios.services.",
    "-- Wygenerowane: node scripts/automapowanie-uslug.mjs (reguły w skrypcie).",
    "-- Odpalić PO 024a. studios.specializations NIE jest zmieniane.",
    "-- Każdy UPDATE ma warunek services = '{}' — nie nadpisze usług zaznaczonych ręcznie.",
    "-- Wiersze „do sprawdzenia” są na dole w komentarzu — decyzja Wojtka.",
    "-- =============================================",
    "",
    "BEGIN;",
    "",
    ...auto.map(
      (s) =>
        `UPDATE studios SET services = ${sqlArr(s.wynik.services)} WHERE id = '${s.id}' AND services = '{}'; -- ${sqlKom(s.nazwa)}`
    ),
    "",
    "-- Dojazd do klienta → work_mode (cecha, nie usługa)",
    ...dojazd.map(
      (s) =>
        `UPDATE studios SET work_mode = array_append(COALESCE(work_mode, '{}'), 'u_klienta') WHERE id = '${s.id}' AND NOT ('u_klienta' = ANY(COALESCE(work_mode, '{}'))); -- ${sqlKom(s.nazwa)}`
    ),
    "",
    "COMMIT;",
    "",
    "-- ---------------------------------------------",
    "-- DO SPRAWDZENIA (niejednoznaczne) — odkomentuj wybraną wersję:",
    ...recz.flatMap((s) => [
      `-- ${sqlKom(s.nazwa)}: ${sqlKom(s.spec.join("; "))}`,
      `-- UPDATE studios SET services = ${sqlArr(s.wynik.services)} WHERE id = '${s.id}' AND services = '{}';`,
    ]),
    "",
    "-- Kontrola po odpaleniu:",
    "-- SELECT business_name, services, specializations FROM studios WHERE deleted_at IS NULL ORDER BY cardinality(services), business_name;",
    "",
  ];

  const podsumowanie = `Studiów: ${studia.length} · auto: ${auto.length} · do sprawdzenia: ${recz.length} · puste/bez core (Faza 5): ${
    studia.filter((s) => !s.spec.length || (!s.wynik.doSprawdzenia && !s.wynik.maCore)).length
  }`;

  if (opt("--md")) writeFileSync(opt("--md"), md.join("\n") + "\n\n" + podsumowanie + "\n");
  if (opt("--sql")) writeFileSync(opt("--sql"), sql.join("\n"));
  console.log(md.join("\n"));
  console.log("\n" + podsumowanie);
}

main();

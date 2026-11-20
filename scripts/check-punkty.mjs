// Kontrola reguł punktów (Gate 1) bez zależności: node scripts/check-punkty.mjs (Node >= 23.6).
import { punktyTxt, oczyscUstawieniaPunktow, mozeWycenic, czyBrakPunktow } from "../src/lib/punkty.ts";

let bledy = 0;
const ok = (warunek, opis) => {
  console.log(`${warunek ? "OK  " : "BŁĄD"} ${opis}`);
  if (!warunek) bledy++;
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(punktyTxt(1) === "1 punkt", "1 punkt");
ok(punktyTxt(2) === "2 punkty", "2 punkty");
ok(punktyTxt(5) === "5 punktów", "5 punktów");
ok(punktyTxt(12) === "12 punktów", "12 punktów");
ok(punktyTxt(22) === "22 punkty", "22 punkty");
ok(punktyTxt(0) === "0 punktów", "0 punktów");

ok(eq(oczyscUstawieniaPunktow(undefined), { start: 10, pakietPunkty: null, pakietCenaZl: null }), "domyślne ustawienia");
ok(eq(oczyscUstawieniaPunktow({ start: 5, pakiet_punkty: 20, pakiet_cena_zl: 99.999 }), { start: 5, pakietPunkty: 20, pakietCenaZl: 100 }), "pakiet + zaokrąglenie ceny");
ok(eq(oczyscUstawieniaPunktow({ start: -3, pakiet_punkty: 0 }), { start: 10, pakietPunkty: null, pakietCenaZl: null }), "złe wartości → domyślne/null");

ok(mozeWycenic(false, null) === true, "płatne WYŁ. → zawsze można");
ok(mozeWycenic(true, null) === false, "płatne WŁ., brak salda → nie");
ok(mozeWycenic(true, { saldo: 0, zwolnione: false }) === false, "saldo 0 → nie");
ok(mozeWycenic(true, { saldo: 1, zwolnione: false }) === true, "saldo 1 → tak");
ok(mozeWycenic(true, { saldo: 0, zwolnione: true }) === true, "zwolnione (Hiline) → tak");

ok(czyBrakPunktow("BRAK_PUNKTOW: studio nie ma punktów na wycenę") === true, "rozpoznaje błąd triggera");
ok(czyBrakPunktow("duplicate key") === false, "inny błąd ≠ brak punktów");

console.log(bledy ? `\n${bledy} błędów` : "\nWszystko OK");
process.exit(bledy ? 1 : 0);

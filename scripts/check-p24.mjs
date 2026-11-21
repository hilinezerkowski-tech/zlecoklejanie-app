// Kontrola podpisów Przelewy24 bez sieci: node scripts/check-p24.mjs (Node >= 23.6).
import { createHash } from "node:crypto";
import { podpisPowiadomieniaOk } from "../src/lib/p24.ts";

let bledy = 0;
const ok = (w, opis) => { console.log(`${w ? "OK  " : "BŁĄD"} ${opis}`); if (!w) bledy++; };
const k = { merchantId: 123, posId: 123, crc: "abc/ż", apiKey: "x", sandbox: true, baseUrl: "" };
const n = { merchantId: 123, posId: 123, sessionId: "s-1", amount: 4900, originAmount: 4900, currency: "PLN", orderId: 99, methodId: 25, statement: "p24-A1/żółw" };
// Wzór z dokumentacji: kolejność kluczy merchantId…statement, crc; JSON bez escapowania „/” i polskich znaków.
const wzor = `{"merchantId":123,"posId":123,"sessionId":"s-1","amount":4900,"originAmount":4900,"currency":"PLN","orderId":99,"methodId":25,"statement":"p24-A1/żółw","crc":"abc/ż"}`;
const sign = createHash("sha384").update(wzor, "utf8").digest("hex");
ok(podpisPowiadomieniaOk(k, { ...n, sign }), "poprawny podpis przechodzi");
ok(!podpisPowiadomieniaOk(k, { ...n, amount: 1, sign }), "zmieniona kwota odpada");
ok(!podpisPowiadomieniaOk({ ...k, crc: "inny" }, { ...n, sign }), "inny CRC odpada");
ok(!podpisPowiadomieniaOk(k, { ...n, sign: "" }), "pusty podpis odpada");
console.log(bledy ? `\n${bledy} błędów` : "\nWszystko OK");
process.exit(bledy ? 1 : 0);

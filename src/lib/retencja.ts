// Retencja wiadomości z paneli: 12 miesięcy od ostatniej aktywności w zleceniu
// (zdanie pod czatem + § 4 ust. 3 polityki prywatności).
//
// DOMYŚLNIE TRYB PRÓBNY: liczy, co zostałoby usunięte, i niczego nie kasuje.
// Prawdziwe usunięcie wymaga JEDNOCZEŚNIE: zmiennej RETENCJA_USUWAJ=1 w Vercelu i parametru ?usun=1.
// Nie jest zaplanowane w pg_cron — uruchamia je Wojtek świadomie (albo dopisze harmonogram).
//
// „Ostatnia aktywność w zleceniu” = najnowsza z: wiadomość, wycena, data utworzenia zlecenia.
// Kasujemy wyłącznie wiadomości (order_messages) takich zleceń; zlecenia, wyceny i email_log zostają.

import type { SupabaseClient } from "@supabase/supabase-js";

export const RETENCJA_MIESIECY = 12;
const LIMIT = 5000;

export type WynikRetencji = {
  tryb: "proba" | "usuniecie";
  granica: string;
  zlecenia: number;
  wiadomosci: number;
  usuniete: number;
};

export async function przetworzRetencje(admin: SupabaseClient, usun: boolean): Promise<WynikRetencji> {
  const granica = new Date();
  granica.setMonth(granica.getMonth() - RETENCJA_MIESIECY);
  const g = granica.toISOString();

  // Wiadomości starsze niż granica → zlecenia-kandydaci.
  const { data: stare } = await admin.from("order_messages").select("id, order_id").lt("created_at", g).limit(LIMIT);
  const wiersze = (stare ?? []) as { id: string; order_id: string }[];
  const kandydaci = Array.from(new Set(wiersze.map((w) => w.order_id)));
  const wynik: WynikRetencji = { tryb: usun ? "usuniecie" : "proba", granica: g, zlecenia: 0, wiadomosci: 0, usuniete: 0 };
  if (kandydaci.length === 0) return wynik;

  // Odrzucamy zlecenia z jakąkolwiek świeższą aktywnością.
  const [{ data: swiezeMsg }, { data: swiezeQuotes }, { data: swiezeOrders }] = await Promise.all([
    admin.from("order_messages").select("order_id").in("order_id", kandydaci).gte("created_at", g),
    admin.from("quotes").select("order_id").in("order_id", kandydaci).gte("created_at", g),
    admin.from("orders").select("id").in("id", kandydaci).gte("created_at", g),
  ]);
  const zywe = new Set<string>([
    ...((swiezeMsg ?? []) as { order_id: string }[]).map((r) => r.order_id),
    ...((swiezeQuotes ?? []) as { order_id: string }[]).map((r) => r.order_id),
    ...((swiezeOrders ?? []) as { id: string }[]).map((r) => r.id),
  ]);
  const doUsuniecia = kandydaci.filter((id) => !zywe.has(id));
  wynik.zlecenia = doUsuniecia.length;
  wynik.wiadomosci = wiersze.filter((w) => doUsuniecia.includes(w.order_id)).length;

  if (usun && doUsuniecia.length > 0) {
    const { data: skasowane, error } = await admin
      .from("order_messages")
      .delete()
      .in("order_id", doUsuniecia)
      .lt("created_at", g)
      .select("id");
    if (error) throw new Error(error.message);
    wynik.usuniete = skasowane?.length ?? 0;
    await admin.from("admin_actions").insert({
      admin_id: null,
      entity: "retencja",
      action: "delete_messages",
      entity_id: null,
      payload: { granica: g, zlecenia: doUsuniecia.length, wiadomosci: wynik.usuniete },
      result: "ok",
      error: null,
    });
  }
  return wynik;
}

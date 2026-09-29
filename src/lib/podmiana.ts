// Dobór następnego studia dla zlecenia, którego dotychczasowe studio odmówiło albo nie odpowiedziało.
// Kryteria z briefu: studioPasuje = „pasuje”, to samo miasto (najbliżej, jak w karcie „nowe zlecenie”),
// bez is_paused, nieprzypisane wcześniej do TEGO zlecenia (także po odmowie/wygaśnięciu).
// Używane przez cron SLA (auto-podmiana) i kartę agenta „Podmień studio”.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cityFromAddress, citySlug } from "@/lib/studio-location";
import { studioPasuje } from "@/lib/uslugi";

export type KandydatPodmiany = { id: string; nazwa: string };

type StudioRow = { id: string; business_name: string | null; address: string | null; services: string[] | null };

export async function znajdzKandydatow(
  admin: SupabaseClient,
  order: { id: string; city: string; service_type: string }
): Promise<KandydatPodmiany[]> {
  const [{ data: studios }, { data: assignments }] = await Promise.all([
    admin
      .from("studios")
      .select("id, business_name, address, services")
      .eq("status", "active")
      .eq("is_paused", false)
      .is("deleted_at", null),
    admin.from("order_assignments").select("studio_id").eq("order_id", order.id),
  ]);
  const wykluczone = new Set((assignments ?? []).map((a: { studio_id: string }) => a.studio_id));
  const slug = citySlug(order.city);
  if (!slug) return [];
  return ((studios ?? []) as StudioRow[])
    .filter((s) => !wykluczone.has(s.id))
    .filter((s) => citySlug(cityFromAddress(s.address)) === slug)
    .filter((s) => studioPasuje(s.services, order.service_type) === "pasuje")
    .map((s) => ({ id: s.id, nazwa: s.business_name || "bez nazwy" }));
}

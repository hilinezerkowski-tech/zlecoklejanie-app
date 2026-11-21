"use server";

// Doładowanie punktów z panelu studia (Gate 1, Faza 2). Studio = zalogowany użytkownik, nigdy z żądania.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/email";
import { utworzPlatnosc, type WynikPlatnosci } from "@/lib/platnosci";

export async function doladujPunkty(): Promise<WynikPlatnosci> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Zaloguj się ponownie." };
  const { data: profil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profil?.role !== "studio") return { ok: false, error: "Doładowanie jest dostępne tylko dla studiów." };
  return utworzPlatnosc(createAdminClient(), user.id, `${APP_URL}/studio/punkty?platnosc=1`);
}

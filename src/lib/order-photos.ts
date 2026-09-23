import { createAdminClient } from "@/lib/supabase/admin";

export const ORDER_PHOTOS_BUCKET = "order-photos";

// Signed URL-e (ważne 1h) dla ścieżek Storage z bucketu order-photos.
// Wołane server-side PO sprawdzeniu uprawnień (rola/własność) — service_role
// omija RLS, więc kontrola dostępu leży w kodzie strony, jak w reszcie portalu.
export async function signedPhotoUrls(
  paths: string[] | null | undefined
): Promise<string[]> {
  const list = (paths ?? []).filter(
    (p): p is string => typeof p === "string" && p.length > 0
  );
  if (list.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(ORDER_PHOTOS_BUCKET)
    .createSignedUrls(list, 3600);
  if (error || !data) return [];
  return data
    .map((d) => d.signedUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
}

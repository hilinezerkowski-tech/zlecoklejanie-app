"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

const BUCKET = "studio-portfolio";
const MAX_ITEMS = 12;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export type PortfolioItem = { url: string; path: string };
type Result = { ok: boolean; error?: string };

// Studio zarządza WŁASNYM portfolio (studios.id === auth uid); admin dowolnym.
async function authorize(studioId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Brak sesji." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role === "admin";
  const isOwner = profile?.role === "studio" && user.id === studioId;
  if (!isAdmin && !isOwner) return { ok: false as const, error: "Brak uprawnień." };

  const admin = createAdminClient();
  const { data: studio } = await admin
    .from("studios")
    .select("portfolio")
    .eq("id", studioId)
    .single();
  if (!studio) return { ok: false as const, error: "Studio nie istnieje." };
  const current: PortfolioItem[] = Array.isArray(studio.portfolio)
    ? (studio.portfolio as PortfolioItem[])
    : [];
  return { ok: true as const, admin, current };
}

export async function addPortfolioPhotos(
  studioId: string,
  formData: FormData
): Promise<Result> {
  const auth = await authorize(studioId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { admin, current } = auth;

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Brak plików." };
  if (current.length + files.length > MAX_ITEMS) {
    return { ok: false, error: `Maksymalnie ${MAX_ITEMS} zdjęć w portfolio.` };
  }

  const added: PortfolioItem[] = [];
  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      return { ok: false, error: "Dozwolone: JPG, PNG, WEBP." };
    }
    if (file.size > MAX_BYTES) return { ok: false, error: "Maks 10 MB / plik." };
    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${studioId}/${crypto.randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (up.error) return { ok: false, error: `Błąd zapisu: ${up.error.message}` };
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    added.push({ url: pub.publicUrl, path });
  }

  await admin
    .from("studios")
    .update({ portfolio: [...current, ...added] })
    .eq("id", studioId);

  revalidatePath("/studio/profil");
  return { ok: true };
}

export async function removePortfolioPhoto(
  studioId: string,
  path: string
): Promise<Result> {
  const auth = await authorize(studioId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { admin, current } = auth;

  await admin.storage.from(BUCKET).remove([path]);
  await admin
    .from("studios")
    .update({ portfolio: current.filter((it) => it.path !== path) })
    .eq("id", studioId);

  revalidatePath("/studio/profil");
  return { ok: true };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { ORDER_PHOTOS_BUCKET } from "@/lib/order-photos";

const MAX_PHOTOS = 6;
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type Result = { ok: boolean; error?: string; added?: number };

// Kto i kiedy może ruszać zdjęcia zlecenia:
// - admin: zawsze,
// - klient-właściciel: dopóki zlecenie otwarte (przed wyborem studia).
async function authorize(orderId: string) {
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
  const role = profile?.role;

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("photos, client_id, status")
    .eq("id", orderId)
    .single();
  if (!order) return { ok: false as const, error: "Zlecenie nie istnieje." };

  const isAdmin = role === "admin";
  const isOwnerOpen =
    role === "client" &&
    order.client_id === user.id &&
    !["chosen", "completed", "cancelled"].includes(order.status as string);

  if (!isAdmin && !isOwnerOpen) {
    return { ok: false as const, error: "Brak uprawnień." };
  }
  const current: string[] = Array.isArray(order.photos) ? order.photos : [];
  return { ok: true as const, admin, current, isAdmin };
}

export async function addOrderPhotos(
  orderId: string,
  formData: FormData
): Promise<Result> {
  const auth = await authorize(orderId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { admin, current } = auth;

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Brak plików." };
  if (current.length + files.length > MAX_PHOTOS) {
    return { ok: false, error: `Maksymalnie ${MAX_PHOTOS} zdjęć na zlecenie.` };
  }

  const added: string[] = [];
  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      return { ok: false, error: "Dozwolone formaty: JPG, PNG, WEBP." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "Maksymalny rozmiar pliku to 10 MB." };
    }
    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `orders/${orderId}/${crypto.randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage
      .from(ORDER_PHOTOS_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: false });
    if (error) return { ok: false, error: `Błąd zapisu zdjęcia: ${error.message}` };
    added.push(path);
  }

  await admin
    .from("orders")
    .update({ photos: [...current, ...added] })
    .eq("id", orderId);

  revalidatePath(`/admin/zlecenia/${orderId}`);
  revalidatePath(`/klient/zlecenia/${orderId}`);
  return { ok: true, added: added.length };
}

export async function removeOrderPhoto(
  orderId: string,
  path: string
): Promise<Result> {
  const auth = await authorize(orderId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { admin, current } = auth;

  if (!current.includes(path)) return { ok: false, error: "Nie ma takiego zdjęcia." };

  await admin.storage.from(ORDER_PHOTOS_BUCKET).remove([path]);
  await admin
    .from("orders")
    .update({ photos: current.filter((p) => p !== path) })
    .eq("id", orderId);

  revalidatePath(`/admin/zlecenia/${orderId}`);
  revalidatePath(`/klient/zlecenia/${orderId}`);
  return { ok: true };
}

"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { addOrderPhotos } from "@/app/actions/order-photos";

// Kompresja po stronie przeglądarki: max 2000 px dłuższy bok, JPEG 0.8.
// Zmniejsza transfer i wagę w Storage. Przy błędzie zwraca oryginał.
async function compress(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const img = await createImageBitmap(file);
    const max = 2000;
    let { width, height } = img;
    if (width > max || height > max) {
      const r = Math.min(max / width, max / height);
      width = Math.round(width * r);
      height = Math.round(height * r);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", 0.8)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

export function PhotoUploader({
  orderId,
  remaining,
}: {
  orderId: string;
  remaining: number;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      for (const f of files.slice(0, remaining)) {
        fd.append("files", await compress(f));
      }
      const res = await addOrderPhotos(orderId, fd);
      if (!res.ok) {
        setError(res.error ?? "Nie udało się wgrać zdjęć.");
      } else {
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Nie udało się wgrać zdjęć.");
    }
    setBusy(false);
  }

  if (remaining <= 0) {
    return (
      <p className="text-xs text-brand-chrom">Osiągnięto limit 6 zdjęć.</p>
    );
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={onChange}
        disabled={busy}
        className="block text-sm text-brand-chrom file:mr-3 file:rounded-lg file:border-0 file:bg-brand-lime file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-grafit hover:file:opacity-90 disabled:opacity-50"
      />
      {busy && <p className="mt-2 text-xs text-brand-chrom">Wgrywanie…</p>}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

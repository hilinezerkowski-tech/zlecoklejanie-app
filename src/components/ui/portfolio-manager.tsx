"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { addPortfolioPhotos, removePortfolioPhoto } from "@/app/actions/portfolio";

type Item = { url: string; path: string };

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
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) =>
      c.toBlob(res, "image/jpeg", 0.8)
    );
    if (!blob) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PortfolioManager({
  studioId,
  items,
}: {
  studioId: string;
  items: Item[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const remaining = 12 - items.length;

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      for (const f of files.slice(0, remaining)) fd.append("files", await compress(f));
      const res = await addPortfolioPhotos(studioId, fd);
      if (!res.ok) setError(res.error ?? "Nie udało się wgrać.");
      else {
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Nie udało się wgrać.");
    }
    setBusy(false);
  }

  async function remove(path: string) {
    if (!confirm("Usunąć to zdjęcie z portfolio?")) return;
    const res = await removePortfolioPhoto(studioId, path);
    if (res.ok) router.refresh();
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {items.map((it) => (
            <div key={it.path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.url}
                alt="Realizacja"
                className="rounded-xl border border-brand-border object-cover w-full h-32"
              />
              <button
                type="button"
                onClick={() => remove(it.path)}
                className="absolute top-1 right-1 rounded-md bg-brand-grafit/80 px-2 py-1 text-xs font-semibold text-brand-kosc hover:bg-red-500 hover:text-white"
              >
                Usuń
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining > 0 ? (
        <>
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
        </>
      ) : (
        <p className="text-xs text-brand-chrom">Osiągnięto limit 12 zdjęć.</p>
      )}
    </div>
  );
}

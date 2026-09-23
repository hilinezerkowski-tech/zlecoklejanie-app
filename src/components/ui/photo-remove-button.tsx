"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeOrderPhoto } from "@/app/actions/order-photos";

// Przycisk usuwania zdjęcia (panel admina). Path to ścieżka w Storage.
export function PhotoRemoveButton({
  orderId,
  path,
}: {
  orderId: string;
  path: string;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  const router = useRouter();

  return (
    <button
      type="button"
      title="Usuń zdjęcie"
      disabled={pending}
      onClick={() => {
        if (!confirm("Usunąć to zdjęcie na stałe?")) return;
        start(async () => {
          const res = await removeOrderPhoto(orderId, path);
          if (res.ok) router.refresh();
          else setErr(true);
        });
      }}
      className={
        "absolute top-1 right-1 rounded-md bg-brand-grafit/80 px-2 py-1 text-xs font-semibold " +
        (err ? "text-red-400" : "text-brand-kosc") +
        " hover:bg-red-500 hover:text-white disabled:opacity-50"
      }
    >
      {pending ? "…" : "Usuń"}
    </button>
  );
}

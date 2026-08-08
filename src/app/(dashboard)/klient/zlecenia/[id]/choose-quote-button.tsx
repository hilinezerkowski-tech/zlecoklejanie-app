"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ChooseQuoteButton({
  quoteId,
  orderId,
  studioName,
}: {
  quoteId: string;
  orderId: string;
  studioName: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChoose() {
    setError(null);
    setLoading(true);

    // Wybor rozstrzyga funkcja SECURITY DEFINER po stronie bazy
    // (klient nie ma uprawnien RLS do zmiany statusow).
    const { error: rpcError } = await supabase.rpc("choose_quote", {
      p_quote_id: quoteId,
    });

    if (rpcError) {
      setLoading(false);
      setConfirming(false);
      setError("Nie udało się wybrać oferty. Odśwież stronę i spróbuj ponownie.");
      return;
    }

    // Powiadomienia e-mail do studia i klienta (best-effort)
    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "chosen", orderId }),
    }).catch(() => {});

    router.refresh();
  }

  if (error) {
    return (
      <div className="text-sm text-red-400">{error}</div>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-brand-chrom">
          Wybrać {studioName}? Pozostałe oferty zostaną odrzucone.
        </span>
        <button
          onClick={handleChoose}
          disabled={loading}
          className="px-4 py-2 bg-brand-lime text-brand-grafit text-sm font-bold rounded-lg disabled:opacity-50 transition"
        >
          {loading ? "Wybieranie…" : "Tak, wybieram"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="px-4 py-2 text-sm text-brand-chrom hover:text-brand-kosc transition"
        >
          Anuluj
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-5 py-2.5 bg-brand-lime text-brand-grafit text-sm font-bold rounded-lg hover:opacity-90 transition"
    >
      Wybierz to studio
    </button>
  );
}

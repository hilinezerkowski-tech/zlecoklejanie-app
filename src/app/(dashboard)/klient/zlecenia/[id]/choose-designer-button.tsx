"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { notifyDesignerChosen } from "@/app/actions/designer-quotes";

/**
 * Wybór grafika przez klienta. Sam wybór rozstrzyga RPC SECURITY DEFINER
 * (klient nie ma uprawnień RLS do zmiany statusów), maile idą osobną akcją.
 *
 * Tor grafika jest niezależny od toru studia — ten przycisk nie dotyka
 * `orders.status` ani wybranego studia.
 */
export function ChooseDesignerButton({
  quoteId,
  orderId,
  designerName,
}: {
  quoteId: string;
  orderId: string;
  designerName: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function wybierz() {
    setError(null);
    setLoading(true);

    const { error: rpcError } = await supabase.rpc("choose_designer_quote", {
      p_quote_id: quoteId,
    });

    if (rpcError) {
      setLoading(false);
      setConfirming(false);
      setError("Nie udało się wybrać grafika. Odśwież stronę i spróbuj ponownie.");
      return;
    }

    // Maile do grafika i do klienta — best-effort, nie blokują wyboru
    notifyDesignerChosen(orderId).catch(() => {});
    router.refresh();
  }

  if (error) {
    return <p className="mt-3 text-sm text-red-400">{error}</p>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="mt-3 px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition"
      >
        Wybieram tego grafika
      </button>
    );
  }

  return (
    <div className="mt-3">
      <p className="text-sm text-brand-chrom mb-2">
        Wybrać <strong className="text-brand-kosc">{designerName}</strong>? Wymienicie
        się kontaktem, a pozostali graficy dostaną informację, że projekt nie idzie
        do nich.
      </p>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={wybierz}
          disabled={loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "Wybieram..." : "Tak, wybieram"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="px-5 py-2.5 text-sm text-brand-chrom hover:text-brand-kosc transition"
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}

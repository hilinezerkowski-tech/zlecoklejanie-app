"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function DesignerActions({
  designerId,
  currentStatus,
  verifiedAt,
}: {
  designerId: string;
  currentStatus: string;
  verifiedAt?: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function updateStatus(newStatus: string) {
    setLoading(true);
    await supabase.from("designers").update({ status: newStatus }).eq("id", designerId);
    router.refresh();
    setLoading(false);
  }

  // Weryfikacja jest niezalezna od statusu: 'active' = moze dostawac briefy,
  // 'verified_at' = obejrzelismy portfolio i realizacje na pojazdach.
  async function toggleVerified() {
    setLoading(true);
    await supabase
      .from("designers")
      .update({ verified_at: verifiedAt ? null : new Date().toISOString() })
      .eq("id", designerId);
    router.refresh();
    setLoading(false);
  }

  if (loading) {
    return <span className="text-xs text-brand-chrom animate-pulse">Aktualizuję...</span>;
  }

  return (
    <div className="flex gap-2 ml-4 shrink-0 flex-wrap justify-end">
      <button
        onClick={toggleVerified}
        title={
          verifiedAt
            ? "Cofnij weryfikacje — odznaka zniknie klientom"
            : "Oznacz jako zweryfikowanego — klient zobaczy odznake przy briefie"
        }
        className={`px-3 py-1.5 text-xs rounded-lg transition font-medium ${
          verifiedAt
            ? "bg-teal-400/15 text-teal-400 hover:bg-teal-400/25"
            : "bg-white/5 text-brand-chrom hover:text-brand-kosc hover:bg-white/10"
        }`}
      >
        {verifiedAt ? "✓ Zweryfikowany" : "Zweryfikuj"}
      </button>
      {currentStatus === "pending" && (
        <>
          <button
            onClick={() => updateStatus("active")}
            className="px-3 py-1.5 text-xs bg-brand-lime/15 text-brand-lime rounded-lg hover:bg-brand-lime/25 transition font-medium"
          >
            Aktywuj
          </button>
          <button
            onClick={() => updateStatus("rejected")}
            className="px-3 py-1.5 text-xs bg-red-400/15 text-red-400 rounded-lg hover:bg-red-400/25 transition font-medium"
          >
            Odrzuć
          </button>
        </>
      )}
      {currentStatus === "active" && (
        <button
          onClick={() => updateStatus("suspended")}
          className="px-3 py-1.5 text-xs bg-red-400/15 text-red-400 rounded-lg hover:bg-red-400/25 transition font-medium"
        >
          Zawieś
        </button>
      )}
      {(currentStatus === "suspended" || currentStatus === "rejected") && (
        <button
          onClick={() => updateStatus("active")}
          className="px-3 py-1.5 text-xs bg-brand-lime/15 text-brand-lime rounded-lg hover:bg-brand-lime/25 transition font-medium"
        >
          Aktywuj
        </button>
      )}
    </div>
  );
}

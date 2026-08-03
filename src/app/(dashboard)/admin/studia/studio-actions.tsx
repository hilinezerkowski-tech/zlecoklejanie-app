"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function StudioActions({
  studioId,
  currentStatus,
}: {
  studioId: string;
  currentStatus: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function updateStatus(newStatus: string) {
    setLoading(true);
    await supabase
      .from("studios")
      .update({ status: newStatus })
      .eq("id", studioId);
    router.refresh();
    setLoading(false);
  }

  if (loading) {
    return (
      <span className="text-xs text-brand-chrom animate-pulse">
        Aktualizuję...
      </span>
    );
  }

  return (
    <div className="flex gap-2 ml-4 shrink-0">
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

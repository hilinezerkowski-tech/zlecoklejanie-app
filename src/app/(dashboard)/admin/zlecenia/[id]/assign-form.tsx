"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Studio {
  id: string;
  business_name: string;
  address: string;
  specializations: string[];
}

export function AssignStudioForm({
  orderId,
  studios,
}: {
  orderId: string;
  studios: Studio[];
}) {
  const [selectedStudio, setSelectedStudio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStudio) return;

    setLoading(true);
    setError("");

    const { error: err } = await supabase.from("order_assignments").insert({
      order_id: orderId,
      studio_id: selectedStudio,
      assigned_by: (await supabase.auth.getUser()).data.user?.id,
    });

    if (err) {
      setError(
        err.message.includes("Maksymalnie")
          ? "To zlecenie ma już 3 przypisane studia."
          : "Nie udało się przypisać studia."
      );
    } else {
      // Zaktualizuj status zlecenia na 'assigned' jeśli było 'new'
      await supabase
        .from("orders")
        .update({ status: "assigned", assigned_at: new Date().toISOString() })
        .eq("id", orderId)
        .eq("status", "new");

      // Powiadomienie e-mail do przypisanego studia (best-effort)
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "assigned", orderId }),
      }).catch(() => {});

      router.refresh();
      setSelectedStudio("");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleAssign} className="mt-4 pt-4 border-t border-brand-border">
      <label className="block text-sm font-medium mb-2">
        Przypisz studio
      </label>
      <div className="flex gap-3">
        <select
          value={selectedStudio}
          onChange={(e) => setSelectedStudio(e.target.value)}
          className="flex-1 px-4 py-2.5 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime transition appearance-none"
        >
          <option value="">Wybierz studio...</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.business_name}
              {s.address && ` — ${s.address}`}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!selectedStudio || loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "..." : "Przypisz"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}

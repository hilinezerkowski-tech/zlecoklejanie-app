"use client";

import { useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface Studio {
  id: string;
  business_name: string;
  address: string;
  city?: string | null;
  specializations: string[];
  odleglosc_km?: number | null; // dopisane przez sortujWgOdleglosci (serwer)
}

// bez polskich znaków + małe litery — żeby "lodz" znajdowało "Łódź"
function norm(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function AssignStudioForm({
  orderId,
  studios,
  orderCity,
}: {
  orderId: string;
  studios: Studio[];
  orderCity?: string | null;
}) {
  const [selectedStudio, setSelectedStudio] = useState("");
  const [query, setQuery] = useState("");
  const [openList, setOpenList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Studia przychodzą z serwera już posortowane wg odległości od miasta zlecenia.
  // Wyszukiwarka tylko zawęża listę (po nazwie, mieście, adresie) — kolejność zostaje.
  const widoczne = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return studios;
    return studios.filter((s) =>
      norm(`${s.business_name} ${s.city ?? ""} ${s.address ?? ""}`).includes(q)
    );
  }, [query, studios]);

  const wybrane = studios.find((s) => s.id === selectedStudio);

  function wybierz(s: Studio) {
    setSelectedStudio(s.id);
    setQuery(s.business_name);
    setOpenList(false);
  }

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
      setQuery("");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleAssign} className="mt-4 pt-4 border-t border-brand-border">
      <label className="block text-sm font-medium mb-2">
        Przypisz studio
        {orderCity && (
          <span className="text-brand-chrom font-normal"> — sortowane od: {orderCity}</span>
        )}
      </label>

      <div className="flex gap-3">
        <div className="relative flex-1">
          {/* Pole wyszukiwarki */}
          <input
            type="text"
            value={query}
            placeholder="Szukaj studia lub miasta..."
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedStudio(""); // zmiana tekstu kasuje wybór, dopóki nie klikniesz pozycji
              setOpenList(true);
            }}
            onFocus={() => setOpenList(true)}
            onBlur={() => {
              // opóźnienie, żeby klik w pozycję zdążył się wykonać przed zamknięciem listy
              blurTimer.current = setTimeout(() => setOpenList(false), 150);
            }}
            className="w-full px-4 py-2.5 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />

          {/* Lista rozwijana — posortowana, z dystansem */}
          {openList && widoczne.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-72 overflow-auto bg-brand-grafit border border-brand-border rounded-xl shadow-xl">
              {widoczne.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()} // nie zabieraj focusa przed kliknięciem
                    onClick={() => wybierz(s)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-brand-grafit-light transition flex items-center justify-between gap-3 ${
                      s.id === selectedStudio ? "bg-brand-grafit-light" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-brand-kosc">{s.business_name}</span>
                      <span className="block truncate text-xs text-brand-chrom">
                        {s.city || s.address}
                      </span>
                    </span>
                    {typeof s.odleglosc_km === "number" && (
                      <span className="shrink-0 text-xs font-medium text-brand-lime">
                        {s.odleglosc_km} km
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {openList && query.trim() && widoczne.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-brand-grafit border border-brand-border rounded-xl px-4 py-2.5 text-sm text-brand-chrom">
              Brak studia pasującego do „{query}”.
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!selectedStudio || loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "..." : "Przypisz"}
        </button>
      </div>

      {wybrane && (
        <p className="mt-2 text-xs text-brand-chrom">
          Wybrane: <span className="text-brand-kosc">{wybrane.business_name}</span>
          {typeof wybrane.odleglosc_km === "number" && orderCity
            ? ` · ${wybrane.odleglosc_km} km od ${orderCity}`
            : ""}
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}

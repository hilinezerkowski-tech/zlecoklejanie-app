"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnStudioProfile } from "./actions";
import { UslugiCheckboxy, type UslugiValue } from "@/components/ui/uslugi-checkboxy";
import { WORK_MODE_U_KLIENTA, oczyscUslugi } from "@/lib/uslugi";

type StudioProfile = {
  id: string;
  business_name: string | null;
  description: string | null;
  services: string[] | null;
  work_mode: string[] | null;
  specializations: string[] | null;
  foil_brands: string[] | null;
  instagram: string | null;
  website: string | null;
  address: string | null;
  service_radius_km: number | null;
  is_paused: boolean | null;
  paused_until?: string | null;
};

// Tablica -> tekst rozdzielany przecinkami (pola „Inne usługi” i foil_brands)
const toText = (arr: string[] | null) => (arr || []).join(", ");

export function ProfileForm({ studio }: { studio: StudioProfile }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [paused, setPaused] = useState(studio.is_paused ?? false);
  const [pausedUntil, setPausedUntil] = useState(studio.paused_until ? studio.paused_until.slice(0, 10) : "");
  const [form, setForm] = useState({
    business_name: studio.business_name || "",
    description: studio.description || "",
    foil_brands: toText(studio.foil_brands),
    instagram: studio.instagram || "",
    website: studio.website || "",
    address: studio.address || "",
    service_radius_km: String(studio.service_radius_km ?? 50),
  });
  const [uslugi, setUslugi] = useState<UslugiValue>({
    services: oczyscUslugi(studio.services),
    uKlienta: (studio.work_mode || []).includes(WORK_MODE_U_KLIENTA),
    inne: toText(studio.specializations),
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    // Zapis przez server action — serwer wymaga min. 1 usługi ze słownika.
    const res = await updateOwnStudioProfile({
      ...form,
      services: uslugi.services,
      u_klienta: uslugi.uKlienta,
      specializations: uslugi.inne,
      is_paused: paused,
      paused_until: paused ? pausedUntil : "",
    });

    if (!res.ok) {
      setError(res.error || "Nie udało się zapisać.");
    } else {
      setSuccess("Zapisano.");
      router.refresh();
    }
    setLoading(false);
  }

  const inputCls =
    "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition";

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 space-y-4"
    >
      <div>
        <label className="block text-xs text-brand-chrom mb-1">Nazwa firmy</label>
        <input
          type="text"
          value={form.business_name}
          onChange={(e) => update("business_name", e.target.value)}
          placeholder="Wrap Studio XYZ"
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs text-brand-chrom mb-1">
          Opis (co Was wyróżnia)
        </label>
        <textarea
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={4}
          placeholder="Kilka zdań o studiu, doświadczeniu, realizacjach..."
          className={inputCls}
        />
      </div>

      <div id="uslugi" className="rounded-xl border border-brand-border bg-brand-grafit p-4">
        <UslugiCheckboxy value={uslugi} onChange={setUslugi} disabled={loading} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            Marki folii (po przecinku)
          </label>
          <input
            type="text"
            value={form.foil_brands}
            onChange={(e) => update("foil_brands", e.target.value)}
            placeholder="3M, Avery, KPMF, Hexis"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Instagram</label>
          <input
            type="text"
            value={form.instagram}
            onChange={(e) => update("instagram", e.target.value)}
            placeholder="@studio_wraps"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Strona WWW</label>
          <input
            type="text"
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://studio.pl"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Adres</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="ul. Przykładowa 10, Kraków"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            Zasięg dojazdu (km)
          </label>
          <input
            type="number"
            min={0}
            value={form.service_radius_km}
            onChange={(e) => update("service_radius_km", e.target.value)}
            placeholder="50"
            className={inputCls}
          />
        </div>
      </div>

      <div className="rounded-xl border border-brand-border bg-brand-grafit p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => setPaused(e.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <strong>Wstrzymaj otrzymywanie zleceń</strong>
            <br />
            <span className="text-brand-chrom">
              Gdy zaznaczone, nie będziesz dostawać nowych zapytań (np. na urlopie).
              Zapisz zmiany, żeby zadziałało.
            </span>
          </span>
        </label>
        {paused && (
          <label className="mt-3 ml-7 flex items-center gap-3 text-sm">
            <span className="text-brand-chrom">Pauza do (opcjonalnie):</span>
            <input
              type="date"
              value={pausedUntil}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setPausedUntil(e.target.value)}
              className="rounded-lg border border-brand-border bg-brand-grafit px-3 py-1.5 text-sm"
            />
            <span className="text-xs text-brand-chrom">po tej dacie zlecenia wrócą same</span>
          </label>
        )}
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "Zapisywanie..." : "Zapisz zmiany"}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-brand-lime">{success}</p>}
      </div>
    </form>
  );
}

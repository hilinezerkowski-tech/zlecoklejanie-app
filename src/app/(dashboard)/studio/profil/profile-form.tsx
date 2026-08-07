"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StudioProfile = {
  id: string;
  business_name: string | null;
  description: string | null;
  specializations: string[] | null;
  foil_brands: string[] | null;
  instagram: string | null;
  website: string | null;
  address: string | null;
  service_radius_km: number | null;
};

// Tablica <-> tekst rozdzielany przecinkami (dla pól specializations / foil_brands)
const toText = (arr: string[] | null) => (arr || []).join(", ");
const toArray = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function ProfileForm({ studio }: { studio: StudioProfile }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    business_name: studio.business_name || "",
    description: studio.description || "",
    specializations: toText(studio.specializations),
    foil_brands: toText(studio.foil_brands),
    instagram: studio.instagram || "",
    website: studio.website || "",
    address: studio.address || "",
    service_radius_km: String(studio.service_radius_km ?? 50),
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const radius = parseInt(form.service_radius_km, 10);

    const { error: updErr } = await supabase
      .from("studios")
      .update({
        business_name: form.business_name.trim() || null,
        description: form.description.trim() || null,
        specializations: toArray(form.specializations),
        foil_brands: toArray(form.foil_brands),
        instagram: form.instagram.replace("@", "").trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        service_radius_km: Number.isFinite(radius) ? radius : 50,
      })
      .eq("id", studio.id);

    if (updErr) {
      setError(`Nie udało się zapisać: ${updErr.message}`);
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            Specjalizacje (po przecinku)
          </label>
          <input
            type="text"
            value={form.specializations}
            onChange={(e) => update("specializations", e.target.value)}
            placeholder="oklejanie, PPF, ceramika, detailing"
            className={inputCls}
          />
        </div>
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

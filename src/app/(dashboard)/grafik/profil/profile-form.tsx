"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DesignerProfile = {
  id: string;
  display_name: string | null;
  city: string | null;
  bio: string | null;
  portfolio_url: string | null;
  instagram: string | null;
  website: string | null;
  specializations: string[] | null;
  software: string[] | null;
  works_on_vehicle_templates: boolean | null;
  price_from: number | null;
  price_to: number | null;
  monthly_capacity: number | null;
};

const toText = (arr: string[] | null) => (arr || []).join(", ");
const toArray = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** "1 200,50 zł" -> 1200.5; pusty -> null */
const toNumber = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function DesignerProfileForm({ designer }: { designer: DesignerProfile }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [templates, setTemplates] = useState(
    Boolean(designer.works_on_vehicle_templates)
  );

  const [form, setForm] = useState({
    display_name: designer.display_name || "",
    city: designer.city || "",
    bio: designer.bio || "",
    portfolio_url: designer.portfolio_url || "",
    instagram: designer.instagram || "",
    website: designer.website || "",
    specializations: toText(designer.specializations),
    software: toText(designer.software),
    price_from: designer.price_from != null ? String(designer.price_from) : "",
    price_to: designer.price_to != null ? String(designer.price_to) : "",
    monthly_capacity:
      designer.monthly_capacity != null ? String(designer.monthly_capacity) : "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (!form.display_name.trim()) {
      setError("Nazwa jest wymagana.");
      setLoading(false);
      return;
    }

    const capacity = parseInt(form.monthly_capacity, 10);

    const { error: updErr } = await supabase
      .from("designers")
      .update({
        display_name: form.display_name.trim(),
        city: form.city.trim() || null,
        bio: form.bio.trim() || null,
        portfolio_url: form.portfolio_url.trim() || null,
        instagram: form.instagram.replace("@", "").trim() || null,
        website: form.website.trim() || null,
        specializations: toArray(form.specializations),
        software: toArray(form.software),
        works_on_vehicle_templates: templates,
        price_from: toNumber(form.price_from),
        price_to: toNumber(form.price_to),
        monthly_capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      })
      .eq("id", designer.id);

    if (updErr) {
      setError(updErr.message);
    } else {
      setSuccess("Zapisano.");
      router.refresh();
    }
    setLoading(false);
  }

  const input =
    "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-lg text-sm " +
    "focus:outline-none focus:border-brand-lime/60 transition";
  const label = "block text-xs text-brand-chrom mb-1.5";

  return (
    <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className={label}>Nazwa / imię i nazwisko *</label>
          <input
            className={input}
            value={form.display_name}
            onChange={(e) => update("display_name", e.target.value)}
          />
        </div>
        <div>
          <label className={label}>Miasto</label>
          <input
            className={input}
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Warszawa (lub: zdalnie)"
          />
        </div>

        <div className="md:col-span-2">
          <label className={label}>
            Portfolio{" "}
            <span className="text-brand-chrom/60">
              — bez niego nie kierujemy briefów
            </span>
          </label>
          <input
            className={input}
            value={form.portfolio_url}
            onChange={(e) => update("portfolio_url", e.target.value)}
            placeholder="https://behance.net/..."
          />
        </div>

        <div className="md:col-span-2">
          <label className={label}>O mnie</label>
          <textarea
            className={input + " min-h-[110px] resize-y"}
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
            placeholder="Czym się zajmujesz, jakie auta oklejałeś, ile projektów masz na koncie."
          />
        </div>

        <div>
          <label className={label}>Instagram</label>
          <input
            className={input}
            value={form.instagram}
            onChange={(e) => update("instagram", e.target.value)}
            placeholder="@nazwa"
          />
        </div>
        <div>
          <label className={label}>Strona WWW</label>
          <input
            className={input}
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://"
          />
        </div>

        <div>
          <label className={label}>Specjalizacje (po przecinku)</label>
          <input
            className={input}
            value={form.specializations}
            onChange={(e) => update("specializations", e.target.value)}
            placeholder="reklama na auto, flota, livery"
          />
        </div>
        <div>
          <label className={label}>Oprogramowanie (po przecinku)</label>
          <input
            className={input}
            value={form.software}
            onChange={(e) => update("software", e.target.value)}
            placeholder="Illustrator, CorelDRAW"
          />
        </div>

        <div>
          <label className={label}>Cena od (zł)</label>
          <input
            className={input}
            value={form.price_from}
            onChange={(e) => update("price_from", e.target.value)}
            placeholder="800"
          />
        </div>
        <div>
          <label className={label}>Cena do (zł)</label>
          <input
            className={input}
            value={form.price_to}
            onChange={(e) => update("price_to", e.target.value)}
            placeholder="3500"
          />
        </div>

        <div>
          <label className={label}>Projektów miesięcznie</label>
          <input
            className={input}
            value={form.monthly_capacity}
            onChange={(e) => update("monthly_capacity", e.target.value)}
            placeholder="6"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2.5 cursor-pointer select-none py-2">
            <input
              type="checkbox"
              checked={templates}
              onChange={(e) => setTemplates(e.target.checked)}
              className="w-4 h-4 shrink-0 accent-[color:var(--brand-lime,#c8f000)]"
            />
            <span className="text-sm">Pracuję na szablonach pojazdów</span>
          </label>
        </div>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-4 text-sm text-brand-lime bg-brand-lime/10 border border-brand-lime/30 rounded-lg px-3 py-2">
          {success}
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-5 px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
      >
        {loading ? "Zapisuję..." : "Zapisz zmiany"}
      </button>
    </div>
  );
}

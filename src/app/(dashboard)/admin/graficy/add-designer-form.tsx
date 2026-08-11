"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createDesigner } from "./actions";

const EMPTY = {
  email: "",
  display_name: "",
  city: "",
  phone: "",
  portfolio_url: "",
  instagram: "",
  website: "",
  specializations: "",
  software: "",
  price_from: "",
  price_to: "",
  monthly_capacity: "",
};

export function AddDesignerForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [templates, setTemplates] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const router = useRouter();

  function update(field: keyof typeof EMPTY, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    // Cala logika (service role, mail powitalny) siedzi w Server Action.
    const res = await createDesigner({ ...form, works_on_vehicle_templates: templates });

    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
    } else {
      setSuccess(res.message || "Grafik dodany.");
      setForm(EMPTY);
      setTemplates(false);
      router.refresh();
    }
    setLoading(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mb-6 px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition"
      >
        + Dodaj grafika
      </button>
    );
  }

  const input =
    "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-lg text-sm " +
    "focus:outline-none focus:border-brand-lime/60 transition";
  const label = "block text-xs text-brand-chrom mb-1.5";

  return (
    <div className="mb-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Dodaj grafika</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-brand-chrom hover:text-brand-kosc transition"
        >
          Zamknij
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className={label}>E-mail *</label>
          <input
            className={input}
            type="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="grafik@example.pl"
          />
        </div>
        <div>
          <label className={label}>Nazwa / imię i nazwisko *</label>
          <input
            className={input}
            required
            value={form.display_name}
            onChange={(e) => update("display_name", e.target.value)}
            placeholder="Studio Kreska / Jan Kowalski"
          />
        </div>
        <div className="md:col-span-2">
          <label className={label}>
            Portfolio * <span className="text-brand-chrom/60">— bez tego nie kierujemy briefów</span>
          </label>
          <input
            className={input}
            value={form.portfolio_url}
            onChange={(e) => update("portfolio_url", e.target.value)}
            placeholder="https://behance.net/..."
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
        <div>
          <label className={label}>Telefon</label>
          <input
            className={input}
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+48 600 000 000"
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
          {/* Wlasny box zamiast <input> na pelna szerokosc — na landingu ta sama
              regula CSS rozpychala checkbox na caly kontener. */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none py-2">
            <input
              type="checkbox"
              checked={templates}
              onChange={(e) => setTemplates(e.target.checked)}
              className="w-4 h-4 shrink-0 accent-[color:var(--brand-lime,#c8f000)]"
            />
            <span className="text-sm">Pracuje na szablonach pojazdów</span>
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
        {loading ? "Dodaję..." : "Dodaj i wyślij zaproszenie"}
      </button>
    </div>
  );
}

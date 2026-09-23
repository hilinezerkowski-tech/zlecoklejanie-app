"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrderAsAdmin, type CreateOrderInput } from "../[id]/actions";

const SERVICE_OPTIONS = [
  { value: "oklejanie", label: "Oklejanie" },
  { value: "ppf", label: "PPF" },
  { value: "branding", label: "Branding" },
  { value: "grafika", label: "Grafika" },
  { value: "inne", label: "Inne" },
];

const SCOPE_OPTIONS = [
  { value: "full", label: "Cały pojazd" },
  { value: "full_wneki", label: "Cały pojazd + wnęki" },
  { value: "partial", label: "Częściowe" },
  { value: "front", label: "Przód" },
];

const inputCls =
  "w-full px-3 py-2 rounded-xl bg-brand-surface border border-brand-border text-sm text-brand-text placeholder-brand-chrom/40 focus:outline-none focus:border-brand-lime/60";
const labelCls = "block text-xs text-brand-chrom mb-1";

export function NewOrderForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<CreateOrderInput>({
    email: "",
    full_name: "",
    phone: "",
    service_type: "oklejanie",
    scope: "full",
    city: "",
    car_brand: "",
    car_model: "",
    car_year: "",
    description: "",
    estimated_min: "",
    estimated_max: "",
  });

  function set(field: keyof CreateOrderInput, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createOrderAsAdmin(form);
      if (!result.ok) {
        setError(result.error ?? "Nieznany błąd.");
        return;
      }
      router.push(`/admin/zlecenia/${result.orderId}`);
    });
  }

  return (
    <div className="max-w-2xl">
      <div className="space-y-6">
        {/* Dane klienta */}
        <div className="bg-brand-surface rounded-2xl border border-brand-border p-6">
          <h2 className="text-sm font-semibold text-brand-chrom uppercase tracking-wider mb-4">
            Dane klienta
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>E-mail klienta *</label>
              <input
                type="email"
                className={inputCls}
                placeholder="klient@przykład.pl"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Imię i nazwisko</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Jan Kowalski"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input
                type="tel"
                className={inputCls}
                placeholder="+48 500 000 000"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>

        {/* Dane zlecenia */}
        <div className="bg-brand-surface rounded-2xl border border-brand-border p-6">
          <h2 className="text-sm font-semibold text-brand-chrom uppercase tracking-wider mb-4">
            Dane zlecenia
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Rodzaj usługi *</label>
              <select
                className={inputCls}
                value={form.service_type}
                onChange={(e) => set("service_type", e.target.value)}
                disabled={pending}
              >
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Zakres</label>
              <select
                className={inputCls}
                value={form.scope}
                onChange={(e) => set("scope", e.target.value)}
                disabled={pending}
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Miasto *</label>
              <input
                type="text"
                className={inputCls}
                placeholder="Warszawa"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Marka auta</label>
              <input
                type="text"
                className={inputCls}
                placeholder="BMW"
                value={form.car_brand}
                onChange={(e) => set("car_brand", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Model auta</label>
              <input
                type="text"
                className={inputCls}
                placeholder="M3"
                value={form.car_model}
                onChange={(e) => set("car_model", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Rok produkcji</label>
              <input
                type="number"
                className={inputCls}
                placeholder="2022"
                min="1990"
                max="2030"
                value={form.car_year}
                onChange={(e) => set("car_year", e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Opis / uwagi klienta</label>
              <textarea
                rows={3}
                className={inputCls}
                placeholder="Szczegóły zlecenia przekazane telefonicznie..."
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Budżet min (PLN)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="3000"
                min="0"
                value={form.estimated_min}
                onChange={(e) => set("estimated_min", e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label className={labelCls}>Budżet max (PLN)</label>
              <input
                type="number"
                className={inputCls}
                placeholder="6000"
                min="0"
                value={form.estimated_max}
                onChange={(e) => set("estimated_max", e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-400/10 border border-red-400/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !form.email || !form.city}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-brand-lime text-brand-bg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-lime/90 transition-colors"
          >
            {pending ? "Zapisuję…" : "Utwórz zlecenie"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            disabled={pending}
            className="px-5 py-2.5 rounded-xl text-sm text-brand-chrom border border-brand-border hover:border-brand-chrom/50 transition-colors"
          >
            Anuluj
          </button>
        </div>
      </div>
    </div>
  );
}

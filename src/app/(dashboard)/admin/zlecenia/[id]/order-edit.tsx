"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateOrderDetails, updateOrderClient } from "./actions";

/*
 * Faza A3 — edycja danych zlecenia i kontaktu klienta przez admina.
 * Przycisk "Edytuj" w nagłówku kafla otwiera okno z formularzem.
 */

const SERVICES: [string, string][] = [
  ["oklejanie", "Oklejanie"],
  ["ppf", "PPF"],
  ["branding", "Branding"],
  ["grafika", "Grafika"],
  ["inne", "Inne"],
];

const SCOPES: [string, string][] = [
  ["", "— brak —"],
  ["full", "Całe auto"],
  ["full_wneki", "Całe auto + wnęki"],
  ["partial", "Częściowe"],
  ["front", "Przód (maska, zderzak)"],
];

const inputCls =
  "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition";
const labelCls = "block text-xs text-brand-chrom mb-1";

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-lime/15 text-brand-lime hover:bg-brand-lime/25 transition"
    >
      Edytuj
    </button>
  );
}

/** Okno modalne — klik w tło zamyka, o ile nic się nie zapisuje. */
function Modal({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-lg bg-brand-grafit-light border border-brand-border rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-brand-chrom hover:text-brand-kosc text-lg leading-none disabled:opacity-40"
            aria-label="Zamknij"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Footer({ busy, error, onCancel }: { busy: boolean; error: string | null; onCancel: () => void }) {
  return (
    <>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 rounded-xl text-sm text-brand-chrom hover:text-brand-kosc disabled:opacity-40"
        >
          Anuluj
        </button>
        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {busy ? "Zapisuję..." : "Zapisz"}
        </button>
      </div>
    </>
  );
}

export type EditableOrder = {
  id: string;
  service_type: string;
  scope: string | null;
  city: string;
  car_brand: string | null;
  car_model: string | null;
  car_year: number | null;
  description: string | null;
  estimated_min: number | null;
  estimated_max: number | null;
};

export function OrderDetailsEditor({ order }: { order: EditableOrder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = () => ({
    service_type: order.service_type,
    scope: order.scope ?? "",
    city: order.city ?? "",
    car_brand: order.car_brand ?? "",
    car_model: order.car_model ?? "",
    car_year: order.car_year?.toString() ?? "",
    description: order.description ?? "",
    estimated_min: order.estimated_min?.toString() ?? "",
    estimated_max: order.estimated_max?.toString() ?? "",
  });
  const [form, setForm] = useState(initial);
  const set = (k: keyof ReturnType<typeof initial>) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function openEditor() {
    setForm(initial()); // zawsze świeże dane z serwera
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateOrderDetails(order.id, { ...form, scope: form.scope || null });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error || "Nie udało się zapisać.");
      }
    });
  }

  return (
    <>
      <EditButton onClick={openEditor} />
      {open && (
        <Modal title="Edytuj dane zlecenia" onClose={() => setOpen(false)} busy={pending}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Usługa</label>
                <select value={form.service_type} onChange={set("service_type")} className={inputCls}>
                  {SERVICES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Zakres</label>
                <select value={form.scope} onChange={set("scope")} className={inputCls}>
                  {SCOPES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Miasto (z kodem pocztowym, np. 05-075 Warszawa)</label>
              <input value={form.city} onChange={set("city")} className={inputCls} required />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Marka</label>
                <input value={form.car_brand} onChange={set("car_brand")} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Model</label>
                <input value={form.car_model} onChange={set("car_model")} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Rocznik</label>
                <input value={form.car_year} onChange={set("car_year")} inputMode="numeric" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Szacunek klienta od (zł)</label>
                <input value={form.estimated_min} onChange={set("estimated_min")} inputMode="numeric" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>do (zł)</label>
                <input value={form.estimated_max} onChange={set("estimated_max")} inputMode="numeric" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Opis</label>
              <textarea value={form.description} onChange={set("description")} rows={5} className={inputCls} />
            </div>
            <Footer busy={pending} error={error} onCancel={() => setOpen(false)} />
          </form>
        </Modal>
      )}
    </>
  );
}

export function ClientEditor({
  orderId,
  client,
}: {
  orderId: string;
  client: { email: string | null; full_name: string | null; phone: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = () => ({
    email: client?.email ?? "",
    full_name: client?.full_name ?? "",
    phone: client?.phone ?? "",
  });
  const [form, setForm] = useState(initial);
  const set = (k: keyof ReturnType<typeof initial>) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function openEditor() {
    setForm(initial());
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const emailChanged = form.email.trim().toLowerCase() !== (client?.email || "").toLowerCase();
    if (
      emailChanged &&
      !window.confirm(
        `Zmienić e-mail klienta na ${form.email.trim()}?\n\nTo zmienia adres logowania klienta i dotyczy WSZYSTKICH jego zleceń.`
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateOrderClient(orderId, form);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error || "Nie udało się zapisać.");
      }
    });
  }

  return (
    <>
      <EditButton onClick={openEditor} />
      {open && (
        <Modal title="Edytuj dane klienta" onClose={() => setOpen(false)} busy={pending}>
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs text-amber-400/90">
              Zmiana dotyczy konta klienta — wszystkich jego zleceń. E-mail to adres logowania.
            </p>
            <div>
              <label className={labelCls}>E-mail</label>
              <input type="email" value={form.email} onChange={set("email")} className={inputCls} required />
            </div>
            <div>
              <label className={labelCls}>Imię i nazwisko</label>
              <input value={form.full_name} onChange={set("full_name")} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input value={form.phone} onChange={set("phone")} inputMode="tel" className={inputCls} />
            </div>
            <Footer busy={pending} error={error} onCancel={() => setOpen(false)} />
          </form>
        </Modal>
      )}
    </>
  );
}

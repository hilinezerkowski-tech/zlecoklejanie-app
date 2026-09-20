"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignDesigner,
  resendDesignerBrief,
  setNeedsDesigner,
  unassignDesigner,
} from "./actions";

export type DesignerOption = {
  id: string;
  display_name: string;
  city: string | null;
  specializations: string[] | null;
  works_on_vehicle_templates: boolean;
};

const MAX_GRAFIKOW = 3;

/** Przełącznik „klient chce grafika" — sygnał z formularza da się poprawić ręcznie. */
export function NeedsDesignerToggle({
  orderId,
  value,
}: {
  orderId: string;
  value: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function przelacz() {
    setLoading(true);
    setError("");
    const res = await setNeedsDesigner(orderId, !value);
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button
        onClick={przelacz}
        disabled={loading}
        className={`px-3 py-1.5 text-xs rounded-lg transition font-medium disabled:opacity-50 ${
          value
            ? "bg-purple-400/15 text-purple-400 hover:bg-purple-400/25"
            : "bg-white/5 text-brand-chrom hover:text-brand-kosc hover:bg-white/10"
        }`}
        title={
          value
            ? "Klient chce grafika — kliknij, żeby cofnąć"
            : "Oznacz, że klient prosi o dobranie grafika"
        }
      >
        {loading ? "..." : value ? "🎨 Klient chce grafika" : "Oznacz: chce grafika"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Formularz: wybór grafika + brief do wysyłki. */
export function AssignDesignerForm({
  orderId,
  designers,
  defaultBrief,
}: {
  orderId: string;
  designers: DesignerOption[];
  defaultBrief: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [designerId, setDesignerId] = useState("");
  const [brief, setBrief] = useState(defaultBrief);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function wyslij(e: React.FormEvent) {
    e.preventDefault();
    if (!designerId) {
      setError("Wybierz grafika.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await assignDesigner(orderId, designerId, brief);
    setLoading(false);
    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
      router.refresh();
      return;
    }
    setSuccess(res.message || "Brief wysłany.");
    setDesignerId("");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition"
      >
        + Przypisz grafika
      </button>
    );
  }

  return (
    <form onSubmit={wyslij} className="space-y-4">
      <div>
        <label className="block text-xs text-brand-chrom mb-1">Grafik (tylko aktywni)</label>
        <select
          value={designerId}
          onChange={(e) => setDesignerId(e.target.value)}
          className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime transition"
        >
          <option value="">— wybierz —</option>
          {designers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.display_name}
              {d.city ? ` · ${d.city}` : ""}
              {d.works_on_vehicle_templates ? " · szablony pojazdów" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs text-brand-chrom mb-1">
          Brief — to dokładnie zobaczy grafik
        </label>
        <textarea
          rows={10}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
        />
        <p className="mt-1 text-xs text-brand-chrom/60">
          Nie wpisuj tu danych kontaktowych klienta — na tym etapie grafik ich nie
          dostaje, kontakt kojarzy admin.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
        >
          {loading ? "Wysyłam..." : "Przypisz i wyślij brief"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-brand-chrom hover:text-brand-kosc transition"
        >
          Anuluj
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-brand-lime">✓ {success}</p>}
    </form>
  );
}

/** Wyślij ponownie / Usuń przy przypisanym grafiku. */
export function DesignerAssignmentActions({
  orderId,
  designerId,
}: {
  orderId: string;
  designerId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"resend" | "remove" | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function ponow() {
    setLoading("resend");
    setError("");
    setMsg("");
    const res = await resendDesignerBrief(orderId, designerId);
    setLoading(null);
    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
      return;
    }
    setMsg(res.message || "Wysłano ponownie.");
  }

  async function usun() {
    setLoading("remove");
    setError("");
    const res = await unassignDesigner(orderId, designerId);
    setLoading(null);
    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="shrink-0 text-right">
      <div className="flex gap-2 justify-end flex-wrap">
        <button
          onClick={ponow}
          disabled={loading !== null}
          className="px-3 py-1.5 text-xs rounded-lg transition font-medium bg-white/5 text-brand-chrom hover:text-brand-kosc hover:bg-white/10 disabled:opacity-50"
        >
          {loading === "resend" ? "Wysyłam..." : "Wyślij ponownie"}
        </button>
        <button
          onClick={usun}
          disabled={loading !== null}
          className="px-3 py-1.5 text-xs bg-red-400/15 text-red-400 rounded-lg hover:bg-red-400/25 transition font-medium disabled:opacity-50"
        >
          {loading === "remove" ? "Usuwam..." : "Usuń"}
        </button>
      </div>
      {msg && <p className="mt-1 text-xs text-brand-lime">✓ {msg}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export { MAX_GRAFIKOW };

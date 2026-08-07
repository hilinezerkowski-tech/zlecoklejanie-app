"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStudio } from "./actions";

export function AddStudioForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    business_name: "",
    city: "",
    address: "",
    instagram: "",
    phone: "",
    nip: "",
    specializations: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    // Cała logika tworzenia konta dzieje się w Server Action (service role).
    const res = await createStudio({
      email: form.email,
      business_name: form.business_name,
      address: form.address,
      instagram: form.instagram,
      phone: form.phone,
      nip: form.nip,
      specializations: form.specializations,
    });

    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
    } else {
      setSuccess(res.message || "Studio dodane.");
      setForm({
        email: "",
        business_name: "",
        city: "",
        address: "",
        instagram: "",
        phone: "",
        nip: "",
        specializations: "",
      });
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
        + Dodaj studio
      </button>
    );
  }

  return (
    <div className="mb-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Dodaj nowe studio</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-brand-chrom hover:text-brand-kosc transition"
        >
          Zamknij ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            Email studia *
          </label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            placeholder="kontakt@studio.pl"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            Nazwa firmy *
          </label>
          <input
            type="text"
            value={form.business_name}
            onChange={(e) => update("business_name", e.target.value)}
            required
            placeholder="Wrap Studio XYZ"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Adres</label>
          <input
            type="text"
            value={form.address}
            onChange={(e) => update("address", e.target.value)}
            placeholder="ul. Przykładowa 10, Kraków"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            Instagram
          </label>
          <input
            type="text"
            value={form.instagram}
            onChange={(e) => update("instagram", e.target.value)}
            placeholder="@studio_wraps"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Telefon</label>
          <input
            type="text"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+48 600 000 000"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">NIP</label>
          <input
            type="text"
            value={form.nip}
            onChange={(e) => update("nip", e.target.value)}
            placeholder="1234567890"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-brand-chrom mb-1">
            Specjalizacje (oddzielone przecinkami)
          </label>
          <input
            type="text"
            value={form.specializations}
            onChange={(e) => update("specializations", e.target.value)}
            placeholder="oklejanie, PPF, ceramika, detailing"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition"
          />
        </div>

        <div className="sm:col-span-2 flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
          >
            {loading ? "Dodawanie..." : "Dodaj studio"}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-brand-lime">{success}</p>}
        </div>
      </form>
    </div>
  );
}

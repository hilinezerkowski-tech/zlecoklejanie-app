"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStudio } from "./actions";
import { adresZKodem, normalizujKod } from "@/lib/kod-pocztowy";

type ProviderType = "studio" | "freelancer";

const TYPE_OPTIONS: { value: ProviderType; label: string; sub: string }[] = [
  { value: "studio", label: "Studio", sub: "Mam warsztat i firmę" },
  { value: "freelancer", label: "Wrapper mobilny", sub: "Pracuję sam, dojeżdżam do klienta" },
];

export function AddStudioForm() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [providerType, setProviderType] = useState<ProviderType>("studio");
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    business_name: "",
    city: "",
    address: "",
    kod: "",
    instagram: "",
    instagram_url: "",
    phone: "",
    nip: "",
    specializations: "",
    years_experience: "",
    service_radius_km: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const isFreelancer = providerType === "freelancer";

    if (!isFreelancer && normalizujKod(form.kod) === "") {
      setError("Kod pocztowy w formacie 00-000.");
      setLoading(false);
      return;
    }

    if (isFreelancer && !form.instagram_url) {
      setError("Link do Instagrama jest wymagany dla wrappera mobilnego.");
      setLoading(false);
      return;
    }

    const res = await createStudio({
      email: form.email,
      business_name: form.business_name,
      address: isFreelancer ? undefined : (adresZKodem(form.address, form.kod) || undefined),
      instagram: isFreelancer ? form.instagram_url : form.instagram,
      instagram_url: isFreelancer ? form.instagram_url : undefined,
      phone: form.phone,
      nip: isFreelancer ? undefined : (form.nip || undefined),
      specializations: form.specializations,
      provider_type: providerType,
      years_experience: form.years_experience ? parseInt(form.years_experience) : undefined,
      service_radius_km: form.service_radius_km ? parseInt(form.service_radius_km) : undefined,
    });

    if (!res.ok) {
      setError(res.error || "Nieznany błąd.");
    } else {
      setSuccess(res.message || "Wykonawca dodany.");
      setForm({
        email: "", business_name: "", city: "", address: "", kod: "",
        instagram: "", instagram_url: "", phone: "", nip: "",
        specializations: "", years_experience: "", service_radius_km: "",
      });
      setProviderType("studio");
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
        + Dodaj wykonawcę
      </button>
    );
  }

  return (
    <div className="mb-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Dodaj nowego wykonawcę</h2>
        <button onClick={() => setOpen(false)} className="text-sm text-brand-chrom hover:text-brand-kosc transition">
          Zamknij ×
        </button>
      </div>

      {/* Przełącznik typu */}
      <div className="flex gap-3 mb-6">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setProviderType(opt.value)}
            className={`flex-1 text-left px-4 py-3 rounded-xl border transition ${
              providerType === opt.value
                ? "border-brand-lime bg-brand-lime/10"
                : "border-brand-border bg-brand-grafit hover:border-white/20"
            }`}
          >
            <div className={`font-semibold text-sm ${providerType === opt.value ? "text-brand-lime" : "text-brand-kosc"}`}>
              {opt.label}
            </div>
            <div className="text-xs text-brand-chrom mt-0.5">{opt.sub}</div>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Email *</label>
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required
            placeholder="kontakt@studio.pl"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
        </div>
        <div>
          <label className="block text-xs text-brand-chrom mb-1">
            {providerType === "freelancer" ? "Imię i nazwisko / ksywka IG *" : "Nazwa firmy *"}
          </label>
          <input type="text" value={form.business_name} onChange={(e) => update("business_name", e.target.value)} required
            placeholder={providerType === "freelancer" ? "Marek W." : "Wrap Studio XYZ"}
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
        </div>

        {/* Pola tylko dla STUDIA */}
        {providerType === "studio" && (
          <>
            <div>
              <label className="block text-xs text-brand-chrom mb-1">Kod pocztowy</label>
              <input type="text" inputMode="numeric" value={form.kod} onChange={(e) => update("kod", e.target.value)}
                placeholder="05-090" maxLength={6}
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
            </div>
            <div>
              <label className="block text-xs text-brand-chrom mb-1">Adres</label>
              <input type="text" value={form.address} onChange={(e) => update("address", e.target.value)}
                placeholder="ul. Przykładowa 10, Kraków"
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
            </div>
            <div>
              <label className="block text-xs text-brand-chrom mb-1">Instagram</label>
              <input type="text" value={form.instagram} onChange={(e) => update("instagram", e.target.value)}
                placeholder="@studio_wraps"
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
            </div>
            <div>
              <label className="block text-xs text-brand-chrom mb-1">NIP</label>
              <input type="text" value={form.nip} onChange={(e) => update("nip", e.target.value)}
                placeholder="1234567890"
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
            </div>
          </>
        )}

        {/* Pola tylko dla FREELANCERA */}
        {providerType === "freelancer" && (
          <>
            <div className="sm:col-span-2">
              <label className="block text-xs text-brand-chrom mb-1">Link do Instagrama (portfolio) *</label>
              <input type="url" value={form.instagram_url} onChange={(e) => update("instagram_url", e.target.value)} required
                placeholder="https://www.instagram.com/marek_wraps"
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
            </div>
            <div>
              <label className="block text-xs text-brand-chrom mb-1">Zasięg dojazdu (km)</label>
              <select value={form.service_radius_km} onChange={(e) => update("service_radius_km", e.target.value)}
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime transition">
                <option value="">– wybierz –</option>
                <option value="30">30 km</option>
                <option value="50">50 km</option>
                <option value="100">100 km</option>
                <option value="200">200 km</option>
                <option value="99999">Cała Polska</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-brand-chrom mb-1">Lata doświadczenia</label>
              <select value={form.years_experience} onChange={(e) => update("years_experience", e.target.value)}
                className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime transition">
                <option value="">– wybierz –</option>
                <option value="0">Mniej niż 1 rok</option>
                <option value="2">1–3 lata</option>
                <option value="4">3–5 lat</option>
                <option value="6">5+ lat</option>
              </select>
            </div>
          </>
        )}

        {/* Wspólne pola */}
        <div>
          <label className="block text-xs text-brand-chrom mb-1">Telefon</label>
          <input type="text" value={form.phone} onChange={(e) => update("phone", e.target.value)}
            placeholder="+48 600 000 000"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-brand-chrom mb-1">
            {providerType === "freelancer" ? "Co robisz (specjalizacje, przecinkami)" : "Specjalizacje (przecinkami)"}
          </label>
          <input type="text" value={form.specializations} onChange={(e) => update("specializations", e.target.value)}
            placeholder="oklejanie, PPF, ceramika"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition" />
        </div>

        <div className="sm:col-span-2 flex items-center gap-4">
          <button type="submit" disabled={loading}
            className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50">
            {loading ? "Dodawanie..." : (providerType === "freelancer" ? "Dodaj wrappera" : "Dodaj studio")}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-brand-lime">{success}</p>}
        </div>
      </form>
    </div>
  );
}

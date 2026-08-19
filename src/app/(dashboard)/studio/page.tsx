import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

// Etykiety usług — spójne z listą zleceń studia
const serviceLabels: Record<string, string> = {
  oklejanie: "Oklejanie",
  ppf: "Folia PPF",
  branding: "Branding",
  grafika: "Grafika",
  inne: "Inne",
};

export default async function StudioDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Dane studia (studios.id === auth uid)
  const { data: studio } = await supabase
    .from("studios")
    .select("business_name, status, gallery")
    .eq("id", user!.id)
    .single();

  const profileComplete = studio?.business_name && studio?.gallery;

  // Przypisania studia + zlecenia (RLS ogranicza do własnych rekordów)
  const { data: assignments } = await supabase
    .from("order_assignments")
    .select(
      `
      id,
      status,
      assigned_at,
      order:orders(
        id,
        service_type,
        car_brand,
        car_model,
        city,
        status,
        created_at
      )
    `
    )
    .eq("studio_id", user!.id)
    .order("assigned_at", { ascending: false });

  // Tylko przypisania z żywym zleceniem
  const all = (assignments || []).filter((a: any) => a.order);
  const active = all.filter(
    (a: any) =>
      a.order.status !== "completed" && a.order.status !== "cancelled"
  );

  // Liczniki do kart statystyk
  const toQuote = active.filter((a: any) => a.status === "pending").length;
  const quoted = active.filter((a: any) => a.status === "quoted").length;
  const won = all.filter((a: any) => a.status === "chosen").length;

  const recent = active.slice(0, 3);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">
        {studio?.business_name
          ? `Witaj, ${studio.business_name}`
          : "Panel studia"}
      </h1>
      <p className="text-brand-chrom mb-8">
        Status konta:{" "}
        <span
          className={`font-medium ${
            studio?.status === "active" ? "text-green-400" : "text-amber-400"
          }`}
        >
          {studio?.status === "active"
            ? "Aktywne"
            : studio?.status === "pending"
            ? "Oczekuje na weryfikację"
            : studio?.status || "Nowe"}
        </span>
      </p>

      {!profileComplete && (
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-amber-400 mb-2">Uzupełnij profil</h2>
          <p className="text-sm text-brand-chrom mb-4">
            Twój profil publiczny jest niekompletny. Dodaj logo, galerię
            portfolio i opis, żeby klienci mogli Cię znaleźć.
          </p>
          <a
            href="/studio/profil"
            className="inline-block px-4 py-2 bg-amber-400 text-brand-grafit font-medium rounded-lg text-sm"
          >
            Uzupełnij profil →
          </a>
        </div>
      )}

      {/* Statystyki */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link
          href="/studio/zlecenia"
          className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 hover:border-brand-lime/40 transition"
        >
          <p className="text-3xl font-bold text-amber-400">{toQuote}</p>
          <p className="text-sm text-brand-chrom mt-1">Do wyceny</p>
        </Link>
        <Link
          href="/studio/zlecenia"
          className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 hover:border-brand-lime/40 transition"
        >
          <p className="text-3xl font-bold text-purple-400">{quoted}</p>
          <p className="text-sm text-brand-chrom mt-1">Wysłane wyceny</p>
        </Link>
        <Link
          href="/studio/historia"
          className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 hover:border-brand-lime/40 transition"
        >
          <p className="text-3xl font-bold text-brand-lime">{won}</p>
          <p className="text-sm text-brand-chrom mt-1">Wygrane zlecenia</p>
        </Link>
      </div>

      {/* Ostatnie aktywne zlecenia */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Ostatnie zlecenia</h2>
        <Link
          href="/studio/zlecenia"
          className="text-sm text-brand-lime hover:underline"
        >
          Zobacz wszystkie →
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-brand-chrom">
            Nie masz obecnie żadnych zleceń do wyceny.
            <br />
            Nowe zapytania z Twojej okolicy pojawią się tutaj automatycznie.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {recent.map((a: any) => (
            <Link
              key={a.id}
              href={`/studio/zlecenia/${a.order.id}`}
              className="block bg-brand-grafit-light border border-brand-border rounded-2xl p-5 hover:border-brand-lime/40 transition"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {serviceLabels[a.order.service_type] ||
                      a.order.service_type}
                    {a.order.car_brand &&
                      ` — ${a.order.car_brand} ${a.order.car_model || ""}`}
                  </p>
                  <p className="text-sm text-brand-chrom mt-1">
                    {a.order.city} ·{" "}
                    {new Date(a.order.created_at).toLocaleDateString("pl-PL")}
                  </p>
                </div>
                <span className="text-brand-chrom text-sm">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

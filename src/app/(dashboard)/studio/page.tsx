import { createClient } from "@/lib/supabase/server";

export default async function StudioDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Pobierz dane studia
  const { data: studio } = await supabase
    .from("studios")
    .select("business_name, status, gallery")
    .eq("id", user!.id)
    .single();

  const profileComplete = studio?.business_name && studio?.gallery;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">
        {studio?.business_name ? `Witaj, ${studio.business_name}` : "Panel studia"}
      </h1>
      <p className="text-brand-chrom mb-8">
        Status konta: {" "}
        <span className={`font-medium ${studio?.status === "active" ? "text-green-400" : "text-amber-400"}`}>
          {studio?.status === "active" ? "Aktywne" : studio?.status === "pending" ? "Oczekuje na weryfikację" : studio?.status || "Nowe"}
        </span>
      </p>

      {!profileComplete && (
        <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold text-amber-400 mb-2">Uzupełnij profil</h2>
          <p className="text-sm text-brand-chrom mb-4">
            Twój profil publiczny jest niekompletny. Dodaj logo, galerię portfolio i opis, 
            żeby klienci mogli Cię znaleźć.
          </p>
          <a href="/studio/profil" className="inline-block px-4 py-2 bg-amber-400 text-brand-grafit font-medium rounded-lg text-sm">
            Uzupełnij profil →
          </a>
        </div>
      )}

      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
        <p className="text-brand-chrom">
          Zlecenia przypisane do Twojego studia pojawią się tutaj.
          <br />
          Panel wycen — Faza 2.
        </p>
      </div>
    </div>
  );
}

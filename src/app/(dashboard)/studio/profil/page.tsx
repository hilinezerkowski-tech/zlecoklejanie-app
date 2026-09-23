import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { PortfolioManager } from "@/components/ui/portfolio-manager";

// Profil publiczny studia — edytowalny przez samo studio.
// RLS „Studio can update own" (auth.uid() = id) pozwala zapisywać własny wiersz.
export default async function StudioProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: studio } = await supabase
    .from("studios")
    .select(
      `
      id,
      business_name,
      is_paused,
      portfolio,
      description,
      specializations,
      foil_brands,
      instagram,
      website,
      address,
      service_radius_km,
      status
    `
    )
    .eq("id", user!.id)
    .single();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Mój profil</h1>
      <p className="text-brand-chrom mb-8 text-sm">
        Te dane widzą klienci przy porównywaniu wycen. Im pełniejszy profil, tym
        większa szansa, że wybiorą właśnie Ciebie.
      </p>

      {!studio ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-brand-chrom">
            Nie znaleziono profilu studia dla tego konta. Skontaktuj się z
            administratorem.
          </p>
        </div>
      ) : (
        <>
          <ProfileForm studio={studio} />

          <section className="mt-10">
            <h2 className="text-lg font-semibold mb-1">Portfolio realizacji</h2>
            <p className="text-brand-chrom mb-4 text-sm">
              Wgraj zdjęcia swoich prac (do 12). Pokażą się na Twoim publicznym
              profilu i pomogą klientom wybrać właśnie Ciebie.
            </p>
            <PortfolioManager
              studioId={studio.id as string}
              items={
                Array.isArray((studio as { portfolio?: unknown }).portfolio)
                  ? ((studio as { portfolio: { url: string; path: string }[] }).portfolio)
                  : []
              }
            />
          </section>
        </>
      )}
    </div>
  );
}

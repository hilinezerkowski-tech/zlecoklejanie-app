import { createClient } from "@/lib/supabase/server";
import { DesignerProfileForm } from "./profile-form";

// Profil grafika — edytowalny przez samego grafika.
// RLS „Designer updates own record" (auth.uid() = id) pozwala zapisac wlasny wiersz,
// a REVOKE UPDATE na status/verified_at pilnuje, zeby nie awansowal sam siebie.
export default async function GrafikProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: designer } = await supabase
    .from("designers")
    .select(
      `
      id,
      display_name,
      city,
      bio,
      portfolio_url,
      instagram,
      website,
      specializations,
      software,
      works_on_vehicle_templates,
      price_from,
      price_to,
      monthly_capacity,
      status
    `
    )
    .eq("id", user!.id)
    .single();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Mój profil</h1>
      <p className="text-brand-chrom mb-8 text-sm">
        Te dane widzi klient, zanim wybierze grafika. Portfolio i praca na
        szablonach pojazdów ważą najwięcej — to po nich klient decyduje.
      </p>

      {!designer ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8 text-center">
          <p className="text-brand-chrom">
            Nie znaleziono profilu grafika dla tego konta. Skontaktuj się z
            administratorem.
          </p>
        </div>
      ) : (
        <DesignerProfileForm designer={designer} />
      )}
    </div>
  );
}

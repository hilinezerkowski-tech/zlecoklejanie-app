import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scalUstawieniaSla } from "@/lib/sla";
import { SlaForm } from "./sla-form";
import { AutomatForm } from "./automat-form";
import { PunktyForm } from "./punkty-form";
import { KLUCZ_PLATNE_WYCENY, KLUCZ_PUNKTY, oczyscUstawieniaPunktow } from "@/lib/punkty";
import {
  DOMYSLNE_PROMIENIE,
  KLUCZ_AUTO_PRZYPISANIE,
  KLUCZ_PROMIENIE,
  oczyscPromienie,
} from "@/lib/automation/ustawienia";

export default async function UstawieniaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .single();

  // Ustawienia SLA i automatycznej podmiany (tabela app_settings, migracja 028b) — tolerancyjnie: bez tabeli domyślne.
  const adminDb = createAdminClient();
  const [{ data: ustawienia }, { error: brakPunktow }] = await Promise.all([
    adminDb
      .from("app_settings")
      .select("key, value")
      .in("key", ["sla", "auto_podmiana", KLUCZ_AUTO_PRZYPISANIE, KLUCZ_PROMIENIE, KLUCZ_PLATNE_WYCENY, KLUCZ_PUNKTY]),
    // Czy migracja 033 jest odpalona (tabela punkty_studia istnieje).
    adminDb.from("punkty_studia").select("studio_id", { head: true, count: "exact" }),
  ]);
  const sla = scalUstawieniaSla(ustawienia?.find((r) => r.key === "sla")?.value);
  const wlaczona = (key: string) =>
    Boolean((ustawienia?.find((r) => r.key === key)?.value as { wlaczona?: boolean } | undefined)?.wlaczona);
  const autoPodmiana = wlaczona("auto_podmiana");
  const promienie =
    oczyscPromienie((ustawienia?.find((r) => r.key === KLUCZ_PROMIENIE)?.value as { promienie?: unknown } | undefined)?.promienie) ??
    [...DOMYSLNE_PROMIENIE];
  const punkty = oczyscUstawieniaPunktow(ustawienia?.find((r) => r.key === KLUCZ_PUNKTY)?.value);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Ustawienia</h1>

      <AutomatForm autoPrzypisanie={wlaczona(KLUCZ_AUTO_PRZYPISANIE)} promienie={promienie} />

      <SlaForm sla={sla} autoPodmiana={autoPodmiana} />

      <PunktyForm
        platneWyceny={wlaczona(KLUCZ_PLATNE_WYCENY)}
        start={punkty.start}
        pakietPunkty={punkty.pakietPunkty}
        pakietCenaZl={punkty.pakietCenaZl}
        migracja={!brakPunktow}
      />

      {/* Profil admina */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Twój profil</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-brand-chrom">Email</dt>
            <dd>{profile?.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-chrom">Rola</dt>
            <dd className="capitalize">{profile?.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-chrom">Konto od</dt>
            <dd>
              {profile?.created_at &&
                new Date(profile.created_at).toLocaleDateString("pl-PL")}
            </dd>
          </div>
        </dl>
      </div>

      {/* Informacje o platformie */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Platforma</h2>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-brand-chrom">Wersja</dt>
            <dd>MVP 1.0</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-chrom">Stack</dt>
            <dd>Next.js 14 + Supabase</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-brand-chrom">Hosting</dt>
            <dd>Vercel</dd>
          </div>
        </dl>
      </div>

      {/* Linki */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <h2 className="font-semibold mb-4">Szybkie linki</h2>
        <div className="space-y-2">
          <a
            href="https://supabase.com/dashboard/project/puhbcpahnecunwirtgsj"
            target="_blank"
            rel="noopener"
            className="block text-sm text-brand-lime hover:underline"
          >
            Panel Supabase →
          </a>
          <a
            href="https://vercel.com/zlec-oklejenie"
            target="_blank"
            rel="noopener"
            className="block text-sm text-brand-lime hover:underline"
          >
            Panel Vercel →
          </a>
          <a
            href="https://github.com/hilinezerkowski-tech/zlecoklejanie-app"
            target="_blank"
            rel="noopener"
            className="block text-sm text-brand-lime hover:underline"
          >
            Repozytorium GitHub →
          </a>
          <a
            href="https://zlecoklejanie.pl"
            target="_blank"
            rel="noopener"
            className="block text-sm text-brand-lime hover:underline"
          >
            Landing page (Netlify) →
          </a>
        </div>
      </div>
    </div>
  );
}

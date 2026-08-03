import { createClient } from "@/lib/supabase/server";

export default async function UstawieniaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user?.id)
    .single();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-8">Ustawienia</h1>

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

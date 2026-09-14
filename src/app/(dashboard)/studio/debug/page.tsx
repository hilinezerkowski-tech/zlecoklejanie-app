import { createClient } from "@/lib/supabase/server";

/**
 * Tymczasowa strona diagnostyczna — pomaga zidentyfikować problemy
 * z kontem studia (brak rekordu studios, brak profilu, złe uprawnienia).
 *
 * DO USUNIĘCIA po rozwiązaniu problemów Kamila i Studio2m.
 */
export default async function StudioDebugPage() {
  const supabase = await createClient();

  // 1. Sesja auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-2xl p-8">
        <h1 className="text-xl font-bold text-red-400 mb-4">Brak sesji auth</h1>
        <p className="text-brand-chrom">
          {authErr ? `Błąd: ${authErr.message}` : "Nie jesteś zalogowany."}
        </p>
      </div>
    );
  }

  // 2. Profil
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, role, email, full_name, phone")
    .eq("id", user.id)
    .single();

  // 3. Studio
  const { data: studio, error: studioErr } = await supabase
    .from("studios")
    .select("id, business_name, status, address, specializations, description")
    .eq("id", user.id)
    .single();

  return (
    <div className="max-w-2xl p-8 space-y-6">
      <h1 className="text-xl font-bold">Diagnostyka konta studia</h1>
      <p className="text-xs text-brand-chrom">
        Strona tymczasowa — do usunięcia po naprawie.
      </p>

      {/* Auth */}
      <section className="bg-brand-grafit-light border border-brand-border rounded-xl p-4 space-y-1">
        <h2 className="text-sm font-bold text-brand-lime">1. Sesja Auth</h2>
        <Row label="user.id" value={user.id} />
        <Row label="email" value={user.email ?? "—"} />
        <Row
          label="email_confirmed"
          value={user.email_confirmed_at ? `✓ ${user.email_confirmed_at}` : "✗ NIE POTWIERDZONE"}
          warn={!user.email_confirmed_at}
        />
        <Row label="user_metadata.role" value={String(user.user_metadata?.role ?? "—")} />
        <Row label="created_at" value={user.created_at ?? "—"} />
        <Row label="last_sign_in_at" value={user.last_sign_in_at ?? "—"} />
      </section>

      {/* Profile */}
      <section className="bg-brand-grafit-light border border-brand-border rounded-xl p-4 space-y-1">
        <h2 className="text-sm font-bold text-brand-lime">2. Profil (profiles)</h2>
        {profileErr ? (
          <p className="text-red-400 text-sm">Błąd: {profileErr.message}</p>
        ) : !profile ? (
          <p className="text-red-400 text-sm font-bold">
            ✗ BRAK REKORDU profiles dla tego user.id! To jest źródło problemu.
          </p>
        ) : (
          <>
            <Row label="id" value={profile.id} />
            <Row label="role" value={profile.role} warn={profile.role !== "studio"} />
            <Row label="email" value={profile.email} />
            <Row label="full_name" value={profile.full_name ?? "—"} />
            <Row label="phone" value={profile.phone ?? "—"} />
            {profile.role !== "studio" && (
              <p className="text-red-400 text-sm font-bold mt-2">
                ⚠ Rola to &quot;{profile.role}&quot; zamiast &quot;studio&quot; — middleware
                przekieruje na /login. Trzeba ustawić role=&apos;studio&apos; w bazie.
              </p>
            )}
          </>
        )}
      </section>

      {/* Studio */}
      <section className="bg-brand-grafit-light border border-brand-border rounded-xl p-4 space-y-1">
        <h2 className="text-sm font-bold text-brand-lime">3. Studio (studios)</h2>
        {studioErr ? (
          <p className="text-red-400 text-sm">Błąd: {studioErr.message}</p>
        ) : !studio ? (
          <p className="text-red-400 text-sm font-bold">
            ✗ BRAK REKORDU studios dla tego user.id! Studio nie może edytować
            profilu, bo go nie ma. Trzeba utworzyć rekord w tabeli studios
            z id = user.id.
          </p>
        ) : (
          <>
            <Row label="id" value={studio.id} />
            <Row label="business_name" value={studio.business_name ?? "— (puste)"} />
            <Row label="status" value={studio.status} warn={studio.status !== "active"} />
            <Row label="address" value={studio.address ?? "— (puste)"} />
            <Row label="description" value={studio.description ? "✓ wypełnione" : "— (puste)"} />
            <Row
              label="specializations"
              value={
                studio.specializations?.length
                  ? studio.specializations.join(", ")
                  : "— (puste)"
              }
            />
            {studio.status !== "active" && (
              <p className="text-red-400 text-sm font-bold mt-2">
                ⚠ Status to &quot;{studio.status}&quot; zamiast &quot;active&quot;.
              </p>
            )}
          </>
        )}
      </section>

      {/* Podsumowanie */}
      <section className="bg-brand-grafit-light border border-brand-border rounded-xl p-4">
        <h2 className="text-sm font-bold text-brand-lime mb-2">Podsumowanie</h2>
        {!profile ? (
          <p className="text-red-400 text-sm">
            Brak profilu. Konto mogło zostać założone z pominięciem triggera
            handle_new_user. Trzeba dodać rekord w profiles ręcznie.
          </p>
        ) : !studio ? (
          <p className="text-red-400 text-sm">
            Profil istnieje, ale brak rekordu studios. Dlatego strona profilu
            pokazuje &quot;Nie znaleziono profilu studia&quot;. Trzeba dodać rekord w studios
            z id = user.id.
          </p>
        ) : profile.role !== "studio" ? (
          <p className="text-red-400 text-sm">
            Profile i studios istnieją, ale rola to &quot;{profile.role}&quot; zamiast
            &quot;studio&quot;. Middleware blokuje dostęp do /studio/*.
          </p>
        ) : studio.status !== "active" ? (
          <p className="text-yellow-400 text-sm">
            Wszystko wygląda OK, ale status studia to &quot;{studio.status}&quot;.
            Jeśli to celowe, profil działa prawidłowo.
          </p>
        ) : (
          <p className="text-brand-lime text-sm">
            ✓ Wszystko wygląda poprawnie. Auth, profile i studios w porządku.
          </p>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <p className="text-sm">
      <span className="text-brand-chrom">{label}:</span>{" "}
      <span className={warn ? "text-red-400 font-bold" : "text-brand-kosc"}>
        {value}
      </span>
    </p>
  );
}

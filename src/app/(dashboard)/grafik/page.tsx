import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const statusInfo: Record<string, { label: string; color: string; note: string }> = {
  pending: {
    label: "Oczekuje na akceptację",
    color: "bg-amber-400/15 text-amber-400",
    note: "Sprawdzamy Twoje portfolio. Odezwiemy się mailem.",
  },
  active: {
    label: "Aktywny",
    color: "bg-brand-lime/15 text-brand-lime",
    note: "Kierujemy do Ciebie briefy klientów.",
  },
  suspended: {
    label: "Zawieszony",
    color: "bg-red-400/15 text-red-400",
    note: "Konto wstrzymane. Napisz do nas, jeśli to pomyłka.",
  },
  rejected: {
    label: "Odrzucony",
    color: "bg-red-400/15 text-red-400",
    note: "Napisz do nas, jeśli chcesz uzupełnić zgłoszenie.",
  },
};

export default async function GrafikDashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: d } = await supabase
    .from("designers")
    .select(
      `id, display_name, city, bio, portfolio_url, instagram, website,
       specializations, software, works_on_vehicle_templates,
       price_from, price_to, monthly_capacity, status, verified_at`
    )
    .eq("id", user!.id)
    .single();

  if (!d) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-4">Panel grafika</h1>
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8">
          <p className="text-brand-chrom">
            Nie znaleziono profilu grafika dla tego konta. Skontaktuj się z
            administratorem.
          </p>
        </div>
      </div>
    );
  }

  // Kompletność profilu — to ona decyduje, czy w ogóle kierujemy brief.
  // Portfolio i szablony pojazdów są najważniejsze, dlatego są na górze listy.
  const checks: { label: string; done: boolean; why: string }[] = [
    {
      label: "Link do portfolio",
      done: Boolean(d.portfolio_url),
      why: "Bez niego nie pokażemy Cię klientowi.",
    },
    {
      label: "Specjalizacje",
      done: Boolean(d.specializations?.length),
      why: "Decydują, jakie briefy do Ciebie trafiają.",
    },
    {
      label: "Oprogramowanie",
      done: Boolean(d.software?.length),
      why: "Studia pytają o format plików produkcyjnych.",
    },
    {
      label: "Widełki cenowe",
      done: Boolean(d.price_from || d.price_to),
      why: "Odsiewa zapytania poza Twoim budżetem.",
    },
    {
      label: "Przepustowość miesięczna",
      done: Boolean(d.monthly_capacity),
      why: "Nie zasypiemy Cię briefami ponad limit.",
    },
    {
      label: "Opis / bio",
      done: Boolean(d.bio),
      why: "Klient czyta to przed wyborem.",
    },
  ];

  const done = checks.filter((c) => c.done).length;
  const pct = Math.round((done / checks.length) * 100);
  const st = statusInfo[d.status] || {
    label: d.status,
    color: "bg-white/10 text-brand-chrom",
    note: "",
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h1 className="text-2xl font-bold">
          Cześć{d.display_name ? `, ${d.display_name}` : ""}
        </h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${st.color}`}>
          {st.label}
        </span>
        {d.verified_at && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-400/15 text-teal-400">
            ✓ Zweryfikowany
          </span>
        )}
      </div>
      <p className="text-sm text-brand-chrom mb-8">{st.note}</p>

      {/* Kompletność profilu */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Kompletność profilu</h2>
          <span className="text-sm text-brand-chrom">
            {done}/{checks.length} · {pct}%
          </span>
        </div>

        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden mb-5">
          <div
            className="h-full bg-brand-lime rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <ul className="space-y-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-3 text-sm">
              <span
                className={
                  c.done ? "text-brand-lime shrink-0" : "text-brand-chrom shrink-0"
                }
              >
                {c.done ? "✓" : "○"}
              </span>
              <span className={c.done ? "" : "text-brand-chrom"}>
                {c.label}
                {!c.done && (
                  <span className="text-brand-chrom/70"> — {c.why}</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {pct < 100 && (
          <Link
            href="/grafik/profil"
            className="inline-block mt-5 px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition"
          >
            Uzupełnij profil
          </Link>
        )}
      </div>

      {/* Jak to działa */}
      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6">
        <h2 className="font-semibold mb-3">Jak trafiają do Ciebie zlecenia</h2>
        <ol className="space-y-2 text-sm text-brand-chrom list-decimal list-inside">
          <li>Klient wypełnia brief na ZlecOklejanie.pl (auto, logo, cel reklamy).</li>
          <li>Kierujemy go do maksymalnie trzech grafików — bez pokazywania cudzych wycen.</li>
          <li>Dostajesz powiadomienie mailem i wyceniasz tylko to, co Ci pasuje.</li>
          <li>Klient wybiera, a Wy dostajecie nawzajem swoje dane kontaktowe.</li>
        </ol>
        <p className="text-sm text-brand-chrom mt-4">
          <strong className="text-brand-kosc">Zero opłat</strong> za dostęp i za
          kontakt. Zarabiamy na czymś innym niż sprzedawanie Ci leadów.
        </p>
      </div>
    </div>
  );
}

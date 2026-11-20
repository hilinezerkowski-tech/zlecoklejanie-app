// Ekran zamiast formularza wyceny, gdy studio nie ma punktów (Gate 1).
// Panel studia: link do /studio/punkty. Link z maila (/o/<token>): link do logowania
// (doładowanie bez logowania dochodzi z Przelewy24 w Fazie 2).

import Link from "next/link";

export function BrakPunktow({ href = "/studio/punkty", etykieta = "Doładuj punkty →" }: { href?: string; etykieta?: string }) {
  return (
    <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl p-6">
      <h2 className="font-semibold text-amber-400 mb-2">Nie masz punktów na wycenę</h2>
      <p className="text-sm text-brand-chrom mb-4">
        Wysłanie wyceny kosztuje 1 punkt. Doładuj punkty, a potem wróć do tego zlecenia — zlecenie czeka na Ciebie do
        końca terminu odpowiedzi. Odmowa jest bezpłatna.
      </p>
      <Link
        href={href}
        className="inline-block px-4 py-2 bg-amber-400 text-brand-grafit font-bold text-sm rounded-xl hover:bg-amber-400/90 transition"
      >
        {etykieta}
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { sprawdzToken } from "@/lib/action-links";
import { signedPhotoUrls } from "@/lib/order-photos";
import { labelUslugi } from "@/lib/uslugi";
import { labelOdmowy } from "@/lib/odmowa";
import { OdpowiedzForm } from "./odpowiedz-form";

// Strona z tokenem w adresie: nie indeksować, nie wysyłać adresu w nagłówku Referer.
export const metadata: Metadata = {
  title: "Zlecenie do wyceny — ZlecOklejanie.pl",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const scopeLabels: Record<string, string> = {
  full: "Całe auto",
  full_wneki: "Całe auto + wnęki",
  partial: "Wybrane elementy",
  front: "Front (maska, zderzak, lusterka)",
};

function Komunikat({ tytul, tekst }: { tytul: string; tekst: string }) {
  return (
    <Ramka>
      <h1 className="text-xl font-bold mb-2">{tytul}</h1>
      <p className="text-sm text-brand-chrom mb-6">{tekst}</p>
      <Link href="/login" className="text-brand-lime text-sm underline">
        Zaloguj się do panelu studia
      </Link>
    </Ramka>
  );
}

function Ramka({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-grafit text-brand-kosc px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <p className="text-xl font-extrabold mb-6">
          zlec<span className="text-brand-lime">oklejanie</span>.pl
        </p>
        {children}
      </div>
    </main>
  );
}

export default async function OdpowiedzPage({ params }: { params: { token: string } }) {
  const t = sprawdzToken(params.token);
  if (!t.ok) {
    return (
      <Komunikat
        tytul={t.powod === "wygasl" ? "Ten link wygasł" : "Link jest nieprawidłowy"}
        tekst={
          t.powod === "wygasl"
            ? "Linki działają 7 dni. Zlecenie znajdziesz w panelu studia — zaloguj się swoim adresem e-mail."
            : "Skopiuj cały adres z wiadomości albo zaloguj się do panelu studia."
        }
      />
    );
  }

  const admin = createAdminClient();
  const { data: a } = await admin
    .from("order_assignments")
    .select("id, status, decline_reason, order_id, studio_id")
    .eq("id", t.assignmentId)
    .maybeSingle();
  if (!a) return <Komunikat tytul="Nie znaleziono zlecenia" tekst="Zlecenie mogło zostać usunięte." />;

  const { data: order } = await admin
    .from("orders")
    .select("id, service_type, car_brand, car_model, car_year, scope, city, description, photos, created_at")
    .eq("id", a.order_id)
    .maybeSingle();
  if (!order) return <Komunikat tytul="Nie znaleziono zlecenia" tekst="Zlecenie mogło zostać usunięte." />;

  if (a.status !== "pending") {
    const opis: Record<string, [string, string]> = {
      quoted: ["Wycena już wysłana", "Dziękujemy — klient dostał Twoją ofertę. Dalszy przebieg zobaczysz w panelu."],
      declined: ["Odmowa zapisana", `Powód: ${labelOdmowy(a.decline_reason)}. Zlecenie przekazaliśmy innemu studiu.`],
      expired: ["Termin minął", "Nie doczekaliśmy się odpowiedzi w terminie, więc zlecenie przekazaliśmy dalej."],
      chosen: ["Klient wybrał Twoją ofertę", "Kontakt do klienta znajdziesz w panelu studia."],
      rejected: ["Klient wybrał inne studio", "Dziękujemy za wycenę."],
    };
    const [tytul, tekst] = opis[a.status] ?? ["Zlecenie nieaktywne", "Szczegóły w panelu studia."];
    return <Komunikat tytul={tytul} tekst={tekst} />;
  }

  const fotki = await signedPhotoUrls(Array.isArray(order.photos) ? order.photos : []);
  const auto = [order.car_brand, order.car_model].filter(Boolean).join(" ");

  return (
    <Ramka>
      <h1 className="text-2xl font-bold mb-1">
        {labelUslugi(order.service_type)}
        {auto && ` — ${auto}`}
      </h1>
      <p className="text-brand-chrom mb-6 text-sm">
        {order.city} · dodano {new Date(order.created_at).toLocaleDateString("pl-PL")}
      </p>

      <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-6 mb-6 space-y-2 text-sm">
        <h2 className="font-semibold mb-2">Szczegóły zapytania</h2>
        <p>
          <span className="text-brand-chrom">Usługa: </span>
          {labelUslugi(order.service_type)}
        </p>
        {auto && (
          <p>
            <span className="text-brand-chrom">Pojazd: </span>
            {auto}
            {order.car_year ? ` (${order.car_year})` : ""}
          </p>
        )}
        {order.scope && (
          <p>
            <span className="text-brand-chrom">Zakres: </span>
            {scopeLabels[order.scope] || order.scope}
          </p>
        )}
        <p>
          <span className="text-brand-chrom">Miasto: </span>
          {order.city}
        </p>
        {order.description && <p className="whitespace-pre-wrap pt-1">{order.description}</p>}
        <p className="text-xs text-brand-chrom pt-2">
          Dane kontaktowe klienta dostaniesz po tym, jak wybierze Twoją ofertę.
        </p>
      </div>

      {fotki.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {fotki.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={u} alt={`Zdjęcie ${i + 1}`} className="rounded-xl border border-brand-border object-cover aspect-[4/3] w-full" />
          ))}
        </div>
      )}

      <OdpowiedzForm token={params.token} />
    </Ramka>
  );
}

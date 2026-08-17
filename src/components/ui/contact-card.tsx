/**
 * Karta kontaktowa drugiej strony transakcji.
 *
 * Renderowana wylacznie na podstawie danych z RPC `get_order_contact`,
 * ktore baza wydaje tylko klientowi i wybranemu studiu po rozstrzygnieciu
 * zlecenia. Komponent niczego sam nie autoryzuje — jest czystym widokiem.
 */

export type OrderContact = {
  party: "studio" | "client";
  display_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
};

export function ContactCard({ contact }: { contact: OrderContact }) {
  const isStudio = contact.party === "studio";

  const title = isStudio ? "Kontakt do studia" : "Kontakt do klienta";
  const hint = isStudio
    ? "Zadzwon lub napisz, aby ustalic termin i szczegoly realizacji. Studio dostalo rowniez Twoj kontakt."
    : "Klient wybral Twoja oferte. Odezwij sie pierwszy — szybka reakcja zwykle decyduje o tym, czy zlecenie dojdzie do skutku.";

  return (
    <div className="bg-brand-lime/5 border border-brand-lime/40 rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-brand-lime">✓</span>
        <h2 className="font-semibold text-brand-lime">{title}</h2>
      </div>

      <p className="text-lg font-semibold mb-1">
        {contact.display_name || (isStudio ? "Wybrane studio" : "Klient")}
      </p>
      {contact.location && (
        <p className="text-sm text-brand-chrom mb-4">{contact.location}</p>
      )}

      <div className="flex flex-wrap gap-3 mt-4">
        {contact.phone && (
          <a
            href={`tel:${contact.phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-2 bg-brand-lime text-brand-grafit font-semibold text-sm px-4 py-2.5 rounded-xl hover:opacity-90 transition"
          >
            📞 {contact.phone}
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex items-center gap-2 border border-brand-border text-sm px-4 py-2.5 rounded-xl hover:border-brand-lime hover:text-brand-lime transition"
          >
            ✉ {contact.email}
          </a>
        )}
      </div>

      {!contact.phone && !contact.email && (
        <p className="text-sm text-brand-chrom">
          Druga strona nie uzupelnila jeszcze danych kontaktowych. Napisz do
          nas na hiline.zerkowski@gmail.com — skojarzymy Was recznie.
        </p>
      )}

      <p className="text-xs text-brand-chrom mt-4 leading-relaxed">{hint}</p>
    </div>
  );
}

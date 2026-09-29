// Punkt kontaktowy w sprawie treści i zgłoszeń (DSA art. 11–12) + link do ustawień cookies.
// Obsługę data-cookie-settings ma PublicAnalytics (layouty stron publicznych).

/** `cookies={false}` w panelach (tam nie ma analityki, więc nie ma czego ustawiać). */
export function PublicFooterNote({ cookies = true }: { cookies?: boolean }) {
  return (
    <p className="mt-4 text-xs text-brand-chrom">
      Kontakt w sprawie treści i zgłoszeń:{" "}
      <a href="mailto:kontakt@zlecoklejanie.pl" className="underline">
        kontakt@zlecoklejanie.pl
      </a>{" "}
      (PL, EN)
      {cookies && (
        <>
          {" "}
          ·{" "}
          <a href="#" data-cookie-settings className="underline">
            Ustawienia cookies
          </a>
        </>
      )}
    </p>
  );
}

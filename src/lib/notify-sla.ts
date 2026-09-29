// Maile i SMS-y pilnowania terminu odpowiedzi studia: przypomnienia i „przekazaliśmy dalej”.
// Linki: tokenowe (src/lib/action-links.ts); bez ACTION_LINK_SECRET → link do panelu studia.

import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_URL, emailLayout, escapeHtml, sendEmailResult } from "@/lib/email";
import { linkAkcji } from "@/lib/action-links";
import { sendSms } from "@/lib/sms";
import { labelUslugi } from "@/lib/uslugi";

type Kontekst = {
  admin: SupabaseClient;
  assignmentId: string;
  orderId: string;
  studioId: string;
};

async function dane({ admin, orderId, studioId }: Kontekst) {
  const [{ data: order }, { data: studio }, { data: profil }] = await Promise.all([
    admin.from("orders").select("id, car_brand, car_model, city, service_type").eq("id", orderId).single(),
    admin.from("studios").select("business_name").eq("id", studioId).single(),
    admin.from("profiles").select("email, phone").eq("id", studioId).single(),
  ]);
  if (!order || !profil?.email) return null;
  const auto = [order.car_brand, order.car_model].filter(Boolean).join(" ");
  return {
    etykieta: auto ? `${auto} — ${order.city}` : `${order.city}`,
    usluga: labelUslugi(order.service_type),
    nazwa: studio?.business_name ?? "",
    email: profil.email as string,
    telefon: (profil.phone as string | null) ?? null,
    orderId: order.id as string,
  };
}

/** krok 1 = przypomnienie po 4 h roboczych, krok 2 = ostatnie przypomnienie (24 h). */
export async function wyslijPrzypomnienie(ctx: Kontekst, krok: 1 | 2): Promise<{ email: string; sms: string }> {
  const d = await dane(ctx);
  if (!d) return { email: "skipped", sms: "skipped" };
  const link = linkAkcji(ctx.assignmentId);
  const url = link ?? `${APP_URL}/studio/zlecenia/${d.orderId}`;
  const ostatnie = krok === 2;

  const r = await sendEmailResult(
    d.email,
    `${ostatnie ? "Ostatnie przypomnienie" : "Przypomnienie"}: zlecenie czeka na wycenę — ${d.etykieta}`,
    emailLayout({
      title: ostatnie ? "Ostatnie przypomnienie o zleceniu" : "Zlecenie czeka na Twoją odpowiedź",
      body: `<p>Cześć ${escapeHtml(d.nazwa)},</p>
        <p>Zlecenie <strong>${escapeHtml(d.etykieta)}</strong> (${escapeHtml(d.usluga)}) czeka na Twoją wycenę lub odmowę.</p>
        <p>${
          ostatnie
            ? "Jeśli nie odpowiesz w najbliższym czasie, przekażemy zlecenie innemu studiu."
            : "Klienci najczęściej wybierają studio, które odpowie jako pierwsze."
        } Jeśli nie możesz go wziąć, kliknij „Nie wezmę” — to też pomaga, bo szybciej znajdziemy klientowi kogoś innego.</p>`,
      ctaUrl: url,
      ctaLabel: "Wyceń lub odrzuć zlecenie",
      footer: link ? "Link działa bez logowania, ważny 7 dni. Nie przekazuj go dalej." : undefined,
    }),
    { log: { event: ostatnie ? "reminder_2" : "reminder_1", recipientRole: "studio", orderId: d.orderId } }
  );

  // SMS tylko przy pierwszym przypomnieniu (brief: przypomnienie T+4 h), tylko z linkiem tokenowym.
  let sms = "skipped";
  if (krok === 1 && link) {
    sms = (
      await sendSms(d.telefon, `ZlecOklejanie: zlecenie ${d.etykieta} czeka na wycene. Wycen lub odrzuc: ${link}`, {
        event: "reminder_1_sms",
        recipientRole: "studio",
        orderId: d.orderId,
      })
    ).status;
  }
  return { email: r.status, sms };
}

/** „Zlecenie przekazaliśmy dalej” — po wygaśnięciu przypisania. */
export async function wyslijWygasniecie(ctx: Kontekst): Promise<string> {
  const d = await dane(ctx);
  if (!d) return "skipped";
  const r = await sendEmailResult(
    d.email,
    `Zlecenie przekazaliśmy dalej — ${d.etykieta}`,
    emailLayout({
      title: "Zlecenie przekazaliśmy dalej",
      body: `<p>Cześć ${escapeHtml(d.nazwa)},</p>
        <p>Nie doczekaliśmy się odpowiedzi w sprawie zlecenia <strong>${escapeHtml(d.etykieta)}</strong>, więc przekazaliśmy je dalej, żeby klient nie czekał.</p>
        <p>Nic nie musisz robić. Żeby kolejne zlecenia nie przechodziły Ci koło nosa, odpowiadaj w ciągu kilku godzin — albo włącz pauzę w profilu, gdy nie możesz brać zleceń.</p>`,
      ctaUrl: `${APP_URL}/studio/profil`,
      ctaLabel: "Ustaw pauzę w profilu",
    }),
    { log: { event: "assignment_expired", recipientRole: "studio", orderId: d.orderId } }
  );
  return r.status;
}

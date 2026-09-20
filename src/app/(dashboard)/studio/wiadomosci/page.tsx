import { createClient } from "@/lib/supabase/server";
import { MarkRead } from "./mark-read";

export const dynamic = "force-dynamic";

export default async function StudioWiadomosciPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS: studio widzi tylko swoje wiadomości. 'email' = wysłane wyłącznie
  // mailem, więc w panelu ich nie pokazujemy.
  const { data: messages } = await supabase
    .from("studio_messages")
    .select("id, subject, body, created_at, read_at")
    .eq("studio_id", user!.id)
    .in("channel", ["both", "panel"])
    .order("created_at", { ascending: false });

  const rows = messages || [];
  const unread = rows.filter((m) => !m.read_at).length;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">Wiadomości od ZlecOklejanie.pl</h1>
      <p className="text-brand-chrom mb-8">
        Informacje od zespołu platformy.
        {unread > 0 && (
          <span className="text-brand-lime font-medium"> Nowe: {unread}</span>
        )}
      </p>

      {unread > 0 && <MarkRead />}

      {rows.length === 0 ? (
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-12 text-center">
          <p className="text-brand-chrom">Brak wiadomości</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((m) => (
            <div
              key={m.id}
              className={`bg-brand-grafit-light border rounded-2xl p-6 ${
                m.read_at ? "border-brand-border" : "border-brand-lime/50"
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-2">
                <h3 className="font-semibold">{m.subject || "Wiadomość"}</h3>
                <div className="flex items-center gap-2 shrink-0">
                  {!m.read_at && (
                    <span className="text-xs px-2 py-1 rounded-full font-medium bg-brand-lime/15 text-brand-lime">
                      Nowa
                    </span>
                  )}
                  <span className="text-xs text-brand-chrom">
                    {new Date(m.created_at).toLocaleString("pl-PL", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/Warsaw",
                    })}
                  </span>
                </div>
              </div>
              <p className="text-sm text-brand-chrom whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

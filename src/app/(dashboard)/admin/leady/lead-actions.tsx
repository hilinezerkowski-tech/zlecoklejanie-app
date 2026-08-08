"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertLeadToOrder, convertLeadToStudio, setLeadStatus } from "./actions";

export default function LeadActions({
  leadId,
  kind,
  status,
  orderId,
}: {
  leadId: string;
  kind: string;
  status: string;
  orderId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Zamiana na zlecenie ma sens tylko dla leadów klienckich, raz.
  const canConvert = kind === "zlecenie" && !orderId && status !== "spam";
  // Lead studia mozna promowac na konto studia, dopoki nie jest obsluzony.
  const canMakeStudio = kind === "studio" && status === "new";

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg(res.ok ? { type: "ok", text: res.message || "Gotowe." } : { type: "err", text: res.error || "Błąd." });
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-2 flex-wrap justify-end">
        {canConvert && (
          <button
            onClick={() => run(() => convertLeadToOrder(leadId))}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-lime text-brand-grafit font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {pending ? "…" : "Utwórz zlecenie"}
          </button>
        )}

        {canMakeStudio && (
          <button
            onClick={() => run(() => convertLeadToStudio(leadId))}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-brand-lime text-brand-grafit font-semibold hover:opacity-90 disabled:opacity-50 transition"
          >
            {pending ? "…" : "Utwórz studio"}
          </button>
        )}

        {orderId && (
          <a
            href={`/admin/zlecenia/${orderId}`}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-brand-lime hover:bg-white/10 transition"
          >
            Zlecenie →
          </a>
        )}

        {status !== "handled" && (
          <button
            onClick={() => run(() => setLeadStatus(leadId, "handled"))}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-brand-chrom hover:text-brand-kosc hover:bg-white/10 disabled:opacity-50 transition"
          >
            Obsłużony
          </button>
        )}

        {status !== "new" && (
          <button
            onClick={() => run(() => setLeadStatus(leadId, "new"))}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-brand-chrom hover:text-brand-kosc hover:bg-white/10 disabled:opacity-50 transition"
          >
            Cofnij do nowych
          </button>
        )}

        {status !== "spam" && (
          <button
            onClick={() => run(() => setLeadStatus(leadId, "spam"))}
            disabled={pending}
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-red-400/80 hover:text-red-400 hover:bg-red-400/10 disabled:opacity-50 transition"
          >
            Spam
          </button>
        )}
      </div>

      {msg && (
        <p className={`text-xs ${msg.type === "ok" ? "text-brand-lime" : "text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

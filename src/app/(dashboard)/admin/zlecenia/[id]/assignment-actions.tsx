"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendAssignedEmail, unassignStudio } from "./actions";

/**
 * Akcje admina przy jednym przypisanym studiu:
 *  - "Wyślij ponownie" — mail "Nowe zlecenie do wyceny" na aktualny adres studia,
 *  - "Usuń" — zdjęcie przypisania (z ostrzeżeniem, gdy są wyceny/wiadomości).
 */
export function AssignmentActions({
  orderId,
  studioId,
  studioName,
  status,
}: {
  orderId: string;
  studioId: string;
  studioName: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function resend() {
    setNote(null);
    startTransition(async () => {
      const res = await resendAssignedEmail(orderId, studioId);
      if (res.ok) {
        setNote({ kind: "ok", text: res.message || "Wysłano ponownie." });
        router.refresh();
      } else {
        setNote({ kind: "err", text: res.error || "Nie udało się wysłać." });
      }
    });
  }

  function remove() {
    if (!window.confirm(`Usunąć przypisanie studia „${studioName}” z tego zlecenia?`)) return;
    setNote(null);
    startTransition(async () => {
      let res = await unassignStudio(orderId, studioId, false);
      // Studio ma już wyceny/wiadomości — drugie pytanie z konkretem, potem force
      if (!res.ok && res.needsConfirm) {
        if (!window.confirm(res.error || "Usunąć mimo to?")) return;
        res = await unassignStudio(orderId, studioId, true);
      }
      if (res.ok) {
        router.refresh();
      } else {
        setNote({ kind: "err", text: res.error || "Nie udało się usunąć." });
      }
    });
  }

  const isChosen = status === "chosen";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={pending}
          title="Wyślij jeszcze raz mail „Nowe zlecenie do wyceny” na aktualny adres studia"
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-lime/15 text-brand-lime hover:bg-brand-lime/25 disabled:opacity-40 transition"
        >
          {pending ? "..." : "Wyślij ponownie"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending || isChosen}
          title={
            isChosen
              ? "Klient wybrał to studio — najpierw cofnij wynik zlecenia"
              : "Usuń przypisanie tego studia"
          }
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-400/15 text-red-400 hover:bg-red-400/25 disabled:opacity-40 transition"
        >
          Usuń
        </button>
      </div>
      {note && (
        <span className={`text-xs ${note.kind === "ok" ? "text-brand-lime" : "text-red-400"}`}>
          {note.text}
        </span>
      )}
    </div>
  );
}

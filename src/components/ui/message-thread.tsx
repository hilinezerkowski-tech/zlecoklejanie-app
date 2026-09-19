"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendOrderMessage } from "@/app/actions/messages";

export type ThreadMessage = {
  id: string;
  sender_role: "client" | "studio";
  body: string;
  created_at: string;
};

/**
 * Rozmowa klient <-> studio w ramach zlecenia.
 * `viewer` decyduje, które dymki są "moje" (po prawej).
 * `canWrite=false` => tylko odczyt (admin, zamknięta rozmowa).
 * Odświeżanie: co 20 s, tylko gdy karta jest widoczna (bez websocketów — prościej i stabilniej).
 */
export function MessageThread({
  orderId,
  studioId,
  viewer,
  messages,
  canWrite,
  otherPartyName,
  closedNote,
}: {
  orderId: string;
  studioId: string;
  viewer: "client" | "studio" | "admin";
  messages: ThreadMessage[];
  canWrite: boolean;
  otherPartyName: string;
  closedNote?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  // Automatyczne odświeżanie rozmowy
  useEffect(() => {
    if (!canWrite) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 20000);
    return () => clearInterval(t);
  }, [canWrite, router]);

  // Przewiń do najnowszej wiadomości
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendOrderMessage(orderId, studioId, body);
      if (res.ok) {
        setText("");
        router.refresh();
      } else {
        setError(res.error || "Nie udało się wysłać.");
      }
    });
  }

  const label = (role: "client" | "studio") =>
    viewer === role ? "Ty" : role === "client" ? "Klient" : otherPartyName;

  return (
    <div className="mt-4 pt-4 border-t border-brand-border">
      <p className="text-sm font-medium mb-3">
        {viewer === "admin" ? "Rozmowa (podgląd)" : `Rozmowa z: ${otherPartyName}`}
      </p>

      {messages.length > 0 ? (
        <div
          ref={listRef}
          className="space-y-2 max-h-80 overflow-y-auto overscroll-contain pr-1 mb-3"
        >
          {messages.map((m) => {
            const mine =
              viewer === "admin" ? m.sender_role === "studio" : m.sender_role === viewer;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    mine
                      ? "bg-brand-lime/15 text-brand-kosc"
                      : "bg-brand-grafit border border-brand-border"
                  }`}
                >
                  <p className="text-[11px] text-brand-chrom mb-0.5">
                    {label(m.sender_role)} ·{" "}
                    {new Date(m.created_at).toLocaleString("pl-PL", {
                      timeZone: "Europe/Warsaw",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-brand-chrom mb-3">
          {canWrite
            ? "Masz pytania do oferty? Napisz tutaj — odpowiedź też pojawi się w panelu."
            : "Brak wiadomości."}
        </p>
      )}

      {canWrite ? (
        <form onSubmit={handleSend} className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="Napisz wiadomość…"
            className="flex-1 px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-base sm:text-sm text-brand-kosc focus:outline-none focus:border-brand-lime transition resize-y"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="px-4 py-2.5 rounded-xl bg-brand-lime text-brand-grafit font-semibold text-sm disabled:opacity-40 transition"
          >
            {pending ? "…" : "Wyślij"}
          </button>
        </form>
      ) : (
        closedNote && <p className="text-xs text-brand-chrom/60">{closedNote}</p>
      )}
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

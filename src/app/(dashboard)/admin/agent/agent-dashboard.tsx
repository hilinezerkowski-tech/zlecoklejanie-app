"use client";

// /admin/agent — Faza 1: feed z Supabase (zlecenia + rejestracje).
// Faza 2 podmieni sugestie regułowe na te z Claude. Faza 5 podłączy
// przyciski akcji (assign_studio, activate_studio, ...) pod /api/admin/agent-action —
// na razie tylko "Otwórz" i "Później"/"Przywróć" robią coś realnego.

import { useMemo, useState } from "react";
import type { AgentAction, AgentCard, AgentFeed, AgentSignalType } from "./types";

// --- konfiguracja typów sygnałów -------------------------------------------

const TYPE_META: Record<
  AgentSignalType,
  { label: string; dot: string; chip: string }
> = {
  new_order: { label: "Zlecenie", dot: "bg-amber-400", chip: "bg-amber-50 text-amber-800" },
  new_studio: { label: "Rejestracja", dot: "bg-[#84c440]", chip: "bg-[#eef7e3] text-[#3f7a12]" },
  email: { label: "Mail", dot: "bg-sky-500", chip: "bg-sky-50 text-sky-800" },
  dm_comment: { label: "Social", dot: "bg-fuchsia-500", chip: "bg-fuchsia-50 text-fuchsia-800" },
};

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;

type Filter = "all" | AgentSignalType;

// --- pomocnicze --------------------------------------------------------------

function timeAgo(iso: string): string {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} godz. temu`;
  return `${Math.round(h / 24)} dni temu`;
}

// --- komponent ----------------------------------------------------------------

export default function AgentDashboard({ initialFeed }: { initialFeed: AgentFeed }) {
  const [feed, setFeed] = useState<AgentFeed>(initialFeed);
  const [filter, setFilter] = useState<Filter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Widok "Pokaż ukryte" ładuje osobną listę z ?hidden=1 zamiast trzymać
  // wszystko w pamięci — karty ukryte nie są potrzebne, dopóki admin o nie nie poprosi.
  const [hiddenView, setHiddenView] = useState(false);
  const [hiddenCards, setHiddenCards] = useState<AgentCard[] | null>(null);
  const [hiddenLoading, setHiddenLoading] = useState(false);

  const cards = useMemo(
    () =>
      feed.cards
        .filter((c) => filter === "all" || c.type === filter)
        .sort(
          (a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [feed, filter],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, new_order: 0, new_studio: 0, email: 0, dm_comment: 0 };
    for (const card of feed.cards) {
      c.all++;
      c[card.type]++;
    }
    return c;
  }, [feed]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agent-feed", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const next = (await res.json()) as AgentFeed;
      setFeed(next);
    } catch {
      showToast("Nie udało się odświeżyć — spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  async function dismissCard(card: AgentCard) {
    // Optymistycznie znika z listy od razu; jak zapis padnie — wraca.
    setFeed((f) => ({ ...f, cards: f.cards.filter((c) => c.id !== card.id), hiddenCount: f.hiddenCount + 1 }));
    const res = await fetch("/api/admin/agent-dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id }),
    });
    if (!res.ok) {
      showToast("Nie udało się ukryć karty — spróbuj ponownie.");
      setFeed((f) => ({ ...f, cards: [...f.cards, card], hiddenCount: Math.max(0, f.hiddenCount - 1) }));
    }
  }

  async function restoreCard(card: AgentCard) {
    setHiddenCards((list) => (list ? list.filter((c) => c.id !== card.id) : list));
    const res = await fetch(`/api/admin/agent-dismiss?cardId=${encodeURIComponent(card.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      showToast("Nie udało się przywrócić karty.");
      setHiddenCards((list) => (list ? [...list, card] : [card]));
      return;
    }
    showToast("Karta przywrócona.");
    // Karta wróci do głównej listy przy najbliższym odświeżeniu.
    setFeed((f) => ({ ...f, hiddenCount: Math.max(0, f.hiddenCount - 1) }));
  }

  async function openHidden() {
    setHiddenView(true);
    setHiddenLoading(true);
    try {
      const res = await fetch("/api/admin/agent-feed?hidden=1", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as AgentFeed;
      setHiddenCards(data.cards);
    } catch {
      showToast("Nie udało się wczytać ukrytych kart.");
      setHiddenCards([]);
    } finally {
      setHiddenLoading(false);
    }
  }

  function runAction(card: AgentCard, action: AgentAction) {
    if (action.kind === "dismiss") {
      void dismissCard(card);
      return;
    }
    if (action.kind === "open" && action.href) {
      window.open(action.href, action.href.startsWith("http") ? "_blank" : "_self");
      return;
    }
    // assign_studio / activate_studio / request_info / reply_* — Faza 5.
    console.info("[agent] akcja (bez efektu do Fazy 5)", { card: card.id, action: action.kind });
    showToast(`„${action.label}” — akcje włączą się w Fazie 5`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Nagłówek */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[#2b2b2b]">Agent</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {counts.all === 0
              ? "Nic nie czeka."
              : `${counts.all} ${counts.all === 1 ? "rzecz czeka" : counts.all < 5 ? "rzeczy czekają" : "rzeczy czeka"} na decyzję · stan z ${timeAgo(feed.generatedAt)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {loading ? "Odświeżam…" : "Odśwież"}
        </button>
      </header>

      {/* Filtry */}
      <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Filtr sygnałów">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} count={counts.all}>
          Wszystko
        </FilterChip>
        {(Object.keys(TYPE_META) as AgentSignalType[]).map((t) => (
          <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)} count={counts[t]}>
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${TYPE_META[t].dot}`} />
            {TYPE_META[t].label}
          </FilterChip>
        ))}
      </nav>

      {/* Karty */}
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
          Brak sygnałów w tym filtrze.
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <li key={card.id}>
              <CardView card={card} onAction={(a) => runAction(card, a)} />
            </li>
          ))}
        </ul>
      )}

      {/* Ukryte karty */}
      <div className="mt-6 border-t border-neutral-200 pt-4">
        {!hiddenView ? (
          feed.hiddenCount > 0 && (
            <button
              type="button"
              onClick={openHidden}
              className="text-sm text-neutral-500 underline-offset-2 hover:underline"
            >
              Pokaż ukryte ({feed.hiddenCount})
            </button>
          )
        ) : (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-neutral-600">Ukryte karty</h2>
              <button
                type="button"
                onClick={() => setHiddenView(false)}
                className="text-sm text-neutral-500 underline-offset-2 hover:underline"
              >
                Zwiń
              </button>
            </div>
            {hiddenLoading ? (
              <p className="text-sm text-neutral-500">Wczytuję…</p>
            ) : !hiddenCards || hiddenCards.length === 0 ? (
              <p className="text-sm text-neutral-500">Brak ukrytych kart.</p>
            ) : (
              <ul className="space-y-3">
                {hiddenCards.map((card) => (
                  <li key={card.id}>
                    <CardView card={card} onAction={() => void restoreCard(card)} restoreOnly />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-md bg-[#2b2b2b] px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// --- podkomponenty ---------------------------------------------------------

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "border-[#2b2b2b] bg-[#2b2b2b] text-white"
          : "border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {children}
      <span className={`ml-1.5 text-xs ${active ? "text-neutral-300" : "text-neutral-400"}`}>{count}</span>
    </button>
  );
}

function CardView({
  card,
  onAction,
  restoreOnly,
}: {
  card: AgentCard;
  onAction: (a: AgentAction) => void;
  /** Widok "Pokaż ukryte": jedyna dostępna akcja to przywrócenie karty. */
  restoreOnly?: boolean;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const meta = TYPE_META[card.type];
  const primary = card.actions.find((a) => a.primary);
  const draft = card.actions.find((a) => a.draft)?.draft;

  return (
    <article
      className={`rounded-lg border bg-white p-4 ${
        card.priority === "high" ? "border-l-4 border-l-amber-400 border-neutral-200" : "border-neutral-200"
      } ${restoreOnly ? "opacity-70" : ""}`}
    >
      {/* wiersz meta */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className={`rounded px-1.5 py-0.5 font-medium ${meta.chip}`}>{meta.label}</span>
        <span>{card.source}</span>
        <span aria-hidden>·</span>
        <time dateTime={card.occurredAt}>{timeAgo(card.occurredAt)}</time>
        {card.priority === "high" && !restoreOnly && <span className="ml-auto font-medium text-amber-700">pilne</span>}
      </div>

      <h2 className="text-base font-semibold text-[#2b2b2b]">{card.title}</h2>

      {/* fakty */}
      <ul className="mt-2 space-y-0.5 text-sm text-neutral-600">
        {card.facts.map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>

      {/* sugestia */}
      <p className="mt-3 rounded-md bg-[#eef1ec] px-3 py-2 text-sm text-[#2b2b2b]">
        <span className="font-medium text-[#3f7a12]">Sugestia: </span>
        {card.suggestion}
      </p>

      {/* projekt odpowiedzi */}
      {draft && !restoreOnly && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setDraftOpen((v) => !v)}
            className="text-sm text-neutral-600 underline-offset-2 hover:underline"
          >
            {draftOpen ? "Zwiń projekt odpowiedzi" : "Pokaż projekt odpowiedzi"}
          </button>
          {draftOpen && (
            <textarea
              defaultValue={draft}
              rows={4}
              className="mt-2 w-full rounded-md border border-neutral-300 p-2 text-sm text-neutral-800 focus:border-[#84c440] focus:outline-none"
            />
          )}
        </div>
      )}

      {/* akcje */}
      <div className="mt-3 flex flex-wrap gap-2">
        {restoreOnly ? (
          <button
            type="button"
            onClick={() => onAction({ kind: "dismiss", label: "Przywróć" })}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Przywróć
          </button>
        ) : (
          card.actions.map((a) => (
            <button
              key={a.kind + a.label}
              type="button"
              onClick={() => onAction(a)}
              className={
                a === primary
                  ? "rounded-md bg-[#84c440] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5fa52e]"
                  : "rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
              }
            >
              {a.label}
            </button>
          ))
        )}
      </div>
    </article>
  );
}

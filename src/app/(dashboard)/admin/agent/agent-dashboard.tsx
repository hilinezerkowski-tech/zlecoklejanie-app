"use client";

// Faza 0 — powłoka UI agenta AI w panelu admina.
// Karty z mock-data; przyciski akcji tylko logują do konsoli i pokazują toast.
// Faza 1: podmienić MOCK_FEED na fetch("/api/admin/agent-feed").
// Faza 5: podpiąć runAction pod /api/admin/agent-action.

import { useMemo, useState } from "react";
import type { AgentAction, AgentCard, AgentFeed, AgentSignalType } from "./types";
import { MOCK_FEED } from "./mock-data";

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

export default function AgentDashboard({ initialFeed }: { initialFeed?: AgentFeed }) {
  const feed = initialFeed ?? MOCK_FEED;
  const [filter, setFilter] = useState<Filter>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const cards = useMemo(
    () =>
      feed.cards
        .filter((c) => !hidden.has(c.id))
        .filter((c) => filter === "all" || c.type === filter)
        .sort(
          (a, b) =>
            PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
            new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
        ),
    [feed, filter, hidden],
  );

  // Liczniki do pasków filtrów (bez ukrytych)
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, new_order: 0, new_studio: 0, email: 0, dm_comment: 0 };
    for (const card of feed.cards) {
      if (hidden.has(card.id)) continue;
      c.all++;
      c[card.type]++;
    }
    return c;
  }, [feed, hidden]);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  // Faza 0: akcje nie wykonują nic w systemie.
  function runAction(card: AgentCard, action: AgentAction) {
    if (action.kind === "dismiss") {
      setHidden((s) => new Set(s).add(card.id));
      return;
    }
    if (action.kind === "open" && action.href) {
      window.open(action.href, action.href.startsWith("http") ? "_blank" : "_self");
      return;
    }
    console.info("[agent] akcja (Faza 0 — bez efektu)", { card: card.id, action: action.kind });
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
          onClick={() => showToast("Odświeżanie włączy się w Fazie 1")}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Odśwież
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

function CardView({ card, onAction }: { card: AgentCard; onAction: (a: AgentAction) => void }) {
  const [draftOpen, setDraftOpen] = useState(false);
  const meta = TYPE_META[card.type];
  const primary = card.actions.find((a) => a.primary);
  const draft = card.actions.find((a) => a.draft)?.draft;

  return (
    <article
      className={`rounded-lg border bg-white p-4 ${
        card.priority === "high" ? "border-l-4 border-l-amber-400 border-neutral-200" : "border-neutral-200"
      }`}
    >
      {/* wiersz meta */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className={`rounded px-1.5 py-0.5 font-medium ${meta.chip}`}>{meta.label}</span>
        <span>{card.source}</span>
        <span aria-hidden>·</span>
        <time dateTime={card.occurredAt}>{timeAgo(card.occurredAt)}</time>
        {card.priority === "high" && <span className="ml-auto font-medium text-amber-700">pilne</span>}
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
      {draft && (
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
        {card.actions.map((a) => (
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
        ))}
      </div>
    </article>
  );
}

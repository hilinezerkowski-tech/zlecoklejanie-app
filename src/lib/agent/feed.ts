import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentCard, AgentFeed } from "@/app/(dashboard)/admin/agent/types";
import {
  fetchNewOrderCards,
  fetchPendingStudioCards,
  fetchStuckLandingLeadCards,
  fetchRespondedFreelancerCards,
} from "@/lib/agent/sources/supabase";
import { fetchGmailCards } from "@/lib/agent/sources/gmail";
import { fetchPostproxyCards } from "@/lib/agent/sources/postproxy";
import { enrichWithSuggestions } from "@/lib/agent/suggest";

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;

function sortCards(cards: AgentCard[]): AgentCard[] {
  return [...cards].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );
}

/**
 * Składa feed agenta ze wszystkich źródeł (Faza 1: tylko Supabase),
 * odfiltrowuje karty ukryte przez admina i sortuje priorytet → data.
 *
 * `includeHidden`: zwraca WYŁĄCZNIE ukryte karty (do widoku "Pokaż ukryte") —
 * karty budujemy tak samo jak zawsze, bo źródłowe dane (zlecenie, studio,
 * lead) nie znikają przy dismissie, znika tylko wiersz w agent_dismissed.
 */
export async function buildAgentFeed(opts: { includeHidden?: boolean } = {}): Promise<AgentFeed> {
  const admin = createAdminClient();

  const [
    orderCards,
    pendingStudioCards,
    stuckLeadCards,
    respondedFreelancerCards,
    gmailCards,
    postproxyCards,
    dismissedRows,
  ] = await Promise.all([
    fetchNewOrderCards(admin),
    fetchPendingStudioCards(admin),
    fetchStuckLandingLeadCards(admin),
    fetchRespondedFreelancerCards(admin),
    fetchGmailCards(admin),
    fetchPostproxyCards(admin),
    admin.from("agent_dismissed").select("card_id"),
  ]);

  const dismissedIds = new Set((dismissedRows.data ?? []).map((r: { card_id: string }) => r.card_id));

  const all = [
    ...orderCards,
    ...pendingStudioCards,
    ...stuckLeadCards,
    ...respondedFreelancerCards,
    ...gmailCards,
    ...postproxyCards,
  ];

  if (opts.includeHidden) {
    return {
      generatedAt: new Date().toISOString(),
      cards: sortCards(all.filter((c) => dismissedIds.has(c.id))),
      hiddenCount: 0,
    };
  }

  // Sugestie z modelu tylko dla widocznych kart — ukryte nie kosztują.
  const visible = await enrichWithSuggestions(
    admin,
    all.filter((c) => !dismissedIds.has(c.id))
  );
  return {
    generatedAt: new Date().toISOString(),
    cards: sortCards(visible),
    hiddenCount: dismissedIds.size,
  };
}

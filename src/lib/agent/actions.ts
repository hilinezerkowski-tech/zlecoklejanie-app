// Wykonanie akcji z kart agenta — Faza 5.
// Każda akcja: guardy z briefu, wpis w admin_actions, po sukcesie karta znika
// (agent_dismissed z reason='done'). Istniejąca logika panelu jest wołana, nie kopiowana:
// mail o zleceniu (notify-assigned), powitanie (studio-welcome), wiadomość do studia
// (sendStudioMessage), wysyłka Gmail/Postproxy (moduły źródeł).

import type { AgentActionKind } from "@/app/(dashboard)/admin/agent/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail } from "@/lib/email";
import { sendAssignedEmail } from "@/lib/notify-assigned";
import { sendStudioWelcome } from "@/lib/studio-welcome";
import { sendStudioMessage } from "@/app/(dashboard)/admin/studia/actions";
import { sendGmailReply } from "@/lib/agent/sources/gmail";
import { sendSocialReply, type SocialReplyTarget } from "@/lib/agent/sources/postproxy";

type AdminClient = ReturnType<typeof createAdminClient>;

export type AgentActionRequest = {
  cardId: string;
  kind: AgentActionKind;
  payload?: Record<string, unknown>;
  draft?: string;
};

export type AgentActionResult =
  | {
      ok: true;
      message: string;
      /** Wysyłka niepotwierdzona — nie oznaczamy karty jako done; zniknie z feedu sama, gdy dojdzie. */
      keepCard?: boolean;
      /** Dodatkowe pola do admin_actions.payload (np. id wysłanej wiadomości). */
      log?: Record<string, unknown>;
    }
  | { ok: false; error: string };

const MAX_STUDIOS_PER_ORDER = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(p: Record<string, unknown> | undefined, k: string): string {
  const v = p?.[k];
  return typeof v === "string" ? v.trim() : "";
}

function strList(p: Record<string, unknown> | undefined, k: string): string[] {
  const v = p?.[k];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
}

const fail = (error: string): AgentActionResult => ({ ok: false, error });

// --- akcje -------------------------------------------------------------------------

async function assignStudio(admin: AdminClient, adminId: string, p?: Record<string, unknown>): Promise<AgentActionResult> {
  const orderId = str(p, "orderId");
  const studioIds = Array.from(new Set(strList(p, "studioIds")));
  if (!UUID.test(orderId)) return fail("Brak poprawnego id zlecenia.");
  if (studioIds.length === 0 || !studioIds.every((id) => UUID.test(id))) return fail("Brak studiów do przypisania.");
  if (studioIds.length > MAX_STUDIOS_PER_ORDER) return fail(`Maksymalnie ${MAX_STUDIOS_PER_ORDER} studia na zlecenie.`);

  const { data: order } = await admin.from("orders").select("id, status").eq("id", orderId).maybeSingle();
  if (!order) return fail("Nie znaleziono zlecenia.");
  if (order.status !== "new") return fail(`Zlecenie ma już status „${order.status}” — przypisania rób w panelu zlecenia.`);

  const { count } = await admin
    .from("order_assignments")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  if ((count ?? 0) > 0) return fail("Zlecenie ma już przypisane studio — kolejne dodaj w panelu zlecenia.");

  const { data: studios } = await admin
    .from("studios")
    .select("id, business_name, status, deleted_at, is_paused")
    .in("id", studioIds);
  const rows = (studios ?? []) as {
    id: string;
    business_name: string | null;
    status: string;
    deleted_at: string | null;
    is_paused: boolean | null;
  }[];
  const notReady = studioIds.filter((id) => {
    const s = rows.find((r) => r.id === id);
    return !s || s.status !== "active" || s.deleted_at || s.is_paused;
  });
  if (notReady.length > 0) {
    return fail("Któreś ze studiów nie jest już aktywne albo ma pauzę leadów — odśwież feed.");
  }

  const { error: insertErr } = await admin
    .from("order_assignments")
    .insert(studioIds.map((studio_id) => ({ order_id: orderId, studio_id, assigned_by: adminId })));
  if (insertErr) {
    return fail(
      insertErr.message.includes("Maksymalnie") ? "To zlecenie ma już 3 przypisane studia." : `Błąd przypisania: ${insertErr.message}`
    );
  }

  await admin
    .from("orders")
    .update({ status: "assigned", assigned_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "new");

  // Mail "Nowe zlecenie do wyceny" — ten sam helper co przycisk Przypisz w panelu.
  let sent = 0;
  for (const studioId of studioIds) {
    const out = await sendAssignedEmail(admin, orderId, studioId);
    if (out.ok && out.result.status === "sent") sent++;
  }

  const names = studioIds.map((id) => rows.find((r) => r.id === id)?.business_name || "studio").join(", ");
  return {
    ok: true,
    message: `Przypisano: ${names}. Maile o zleceniu: ${sent}/${studioIds.length} wysłane${sent < studioIds.length ? " — resztę wyślesz ponownie z panelu zlecenia" : ""}.`,
  };
}

async function activateStudio(admin: AdminClient, p?: Record<string, unknown>): Promise<AgentActionResult> {
  const studioId = str(p, "studioId");
  if (!UUID.test(studioId)) return fail("Brak poprawnego id studia.");

  const [{ data: studio }, { data: profile }] = await Promise.all([
    admin.from("studios").select("id, business_name, status, provider_type, deleted_at").eq("id", studioId).maybeSingle(),
    admin.from("profiles").select("email").eq("id", studioId).maybeSingle(),
  ]);
  if (!studio) return fail("Nie znaleziono studia.");
  if (studio.deleted_at) return fail("Studio jest usunięte.");
  if (studio.status === "active") return fail("Studio jest już aktywne.");
  const email = (profile?.email || "").trim();
  if (!isValidEmail(email)) return fail("Studio nie ma poprawnego e-maila — bez adresu nie ma komu wysłać powitania.");

  const { error } = await admin.from("studios").update({ status: "active" }).eq("id", studioId);
  if (error) return fail(`Błąd aktywacji: ${error.message}`);

  const welcomeSent = await sendStudioWelcome(admin, email, studio.business_name || "Twoje studio", studio.provider_type ?? "studio");
  return {
    ok: true,
    message: `Aktywowano ${studio.business_name || "studio"}. Mail powitalny ${welcomeSent ? `wysłany na ${email}` : "NIE wysłany — skontaktuj się ręcznie"}.`,
  };
}

async function requestInfo(p: Record<string, unknown> | undefined, draft: string): Promise<AgentActionResult> {
  const studioId = str(p, "studioId");
  if (!UUID.test(studioId)) return fail("Brak poprawnego id studia.");
  if (!draft) return fail("Pusty projekt wiadomości — uzupełnij treść.");
  // sendStudioMessage: adresat z bazy, nadawca kontakt@, log w email_log i studio_messages.
  const res = await sendStudioMessage(studioId, {
    subject: "ZlecOklejanie.pl — prośba o uzupełnienie profilu",
    body: draft,
    channel: "email",
  });
  return res.ok ? { ok: true, message: `Wysłano. ${res.message ?? ""}`.trim() } : fail(res.error ?? "Nie udało się wysłać wiadomości.");
}

async function replyEmail(p: Record<string, unknown> | undefined, draft: string): Promise<AgentActionResult> {
  const threadId = str(p, "threadId");
  if (!/^[0-9a-f]{8,32}$/i.test(threadId)) return fail("Brak poprawnego id wątku Gmail.");
  if (!draft) return fail("Pusty projekt odpowiedzi — uzupełnij treść.");
  const r = await sendGmailReply(threadId, draft);
  return r.ok ? { ok: true, message: `Wysłano odpowiedź do ${r.to}.` } : fail(r.error);
}

async function replySocial(p: Record<string, unknown> | undefined, draft: string): Promise<AgentActionResult> {
  if (!draft) return fail("Pusty projekt odpowiedzi — uzupełnij treść.");
  const mode = str(p, "mode");
  const profileId = str(p, "profileId");
  let target: SocialReplyTarget;
  if (mode === "comment") {
    const postId = str(p, "postId");
    const parentId = str(p, "parentId");
    if (!postId || !parentId) return fail("Brak danych komentarza.");
    target = { mode, profileId, postId, parentId };
  } else if (mode === "chat") {
    const chatId = str(p, "chatId");
    if (!chatId) return fail("Brak danych czatu.");
    target = { mode, profileId, chatId };
  } else {
    return fail("Nieznany rodzaj odpowiedzi.");
  }
  const r = await sendSocialReply(target, draft);
  if (!r.ok) return fail(r.error);
  const log = { sentId: r.sentId, sendStatus: r.status };
  if (r.confirmed) return { ok: true, message: `Wysłano: ${r.where}.`, log };
  return {
    ok: true,
    keepCard: true,
    log,
    message: `Przyjęte do wysyłki (${r.where}), ale Postproxy jeszcze nie potwierdził (status: ${r.status}). Nie wysyłaj ponownie — odśwież feed za kilka minut: jeśli karta wróci, wiadomość nie doszła.`,
  };
}

// --- wejście ---------------------------------------------------------------------------

export async function executeAgentAction(
  admin: AdminClient,
  adminId: string,
  req: AgentActionRequest
): Promise<AgentActionResult> {
  const draft = (req.draft ?? "").trim();
  let result: AgentActionResult;
  try {
    switch (req.kind) {
      case "assign_studio":
        result = await assignStudio(admin, adminId, req.payload);
        break;
      case "activate_studio":
        result = await activateStudio(admin, req.payload);
        break;
      case "request_info":
        result = await requestInfo(req.payload, draft);
        break;
      case "reply_email":
        result = await replyEmail(req.payload, draft);
        break;
      case "reply_social":
        result = await replySocial(req.payload, draft);
        break;
      default:
        result = fail("Tej akcji nie wykonuje się przez agenta.");
    }
  } catch (e) {
    result = fail(`Błąd: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
  }

  // Dziennik — best effort: brak tabeli (migracja 023 nieodpalona) nie może ukryć wyniku akcji.
  const { error: logErr } = await admin.from("admin_actions").insert({
    admin_id: adminId,
    entity: "agent",
    action: req.kind,
    entity_id: req.cardId,
    payload: { ...(req.payload ?? {}), ...(draft ? { draft } : {}), ...(result.ok ? result.log : {}) },
    result: result.ok ? "ok" : "error",
    error: result.ok ? null : result.error.slice(0, 500),
  });
  if (logErr) console.warn("[agent] admin_actions insert failed:", logErr.message);

  if (result.ok && !result.keepCard) {
    const row = { card_id: req.cardId, dismissed_by: adminId, dismissed_at: new Date().toISOString() };
    const { error } = await admin.from("agent_dismissed").upsert({ ...row, reason: "done" });
    // Bez migracji 023 nie ma kolumny reason — karta i tak ma zniknąć.
    if (error) await admin.from("agent_dismissed").upsert(row);
  }
  return result;
}

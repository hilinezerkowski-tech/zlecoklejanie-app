// Typy kart agenta AI w panelu /admin/agent
// Faza 0: same typy + mock. Od Fazy 1 feed pochodzi z /api/admin/agent-feed

export type AgentSignalType = "new_order" | "new_studio" | "email" | "dm_comment";

export type AgentPriority = "high" | "normal" | "low";

export type AgentActionKind =
  | "assign_studio" // przypisz studio do zlecenia
  | "activate_studio" // aktywuj konto wykonawcy
  | "request_info" // poproś wykonawcę o brakujące dane
  | "reply_email" // wyślij odpowiedź mailem
  | "reply_social" // odpowiedz na komentarz / DM
  | "open" // otwórz szczegóły w panelu
  | "dismiss"; // ukryj kartę

export interface AgentAction {
  kind: AgentActionKind;
  label: string;
  primary?: boolean;
  /** Link do istniejącej strony panelu (np. /admin/zlecenia/123) */
  href?: string;
  /** Projekt treści do wysłania — mail lub odpowiedź na DM/komentarz */
  draft?: string;
}

export interface AgentCard {
  id: string;
  type: AgentSignalType;
  priority: AgentPriority;
  /** Skąd sygnał: "Supabase", "Gmail", "Facebook", "Instagram" */
  source: string;
  /** Kiedy zdarzenie zaszło (ISO) */
  occurredAt: string;
  title: string;
  /** Twarde fakty z danych — bez interpretacji */
  facts: string[];
  /** Sugestia AI — jedno zdanie, co zrobić */
  suggestion: string;
  actions: AgentAction[];
}

export interface AgentFeed {
  generatedAt: string;
  cards: AgentCard[];
}

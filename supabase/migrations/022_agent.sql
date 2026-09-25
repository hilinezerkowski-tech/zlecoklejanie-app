-- =============================================
-- Agent AI w panelu admina — tabele wspólne dla wszystkich faz
-- (brief: agent-admin-brief.md; numer migracji 022, nie 018 —
--  018 zajęte przez 018_reviews.sql)
-- =============================================

CREATE TABLE public.agent_dismissed (
  card_id text PRIMARY KEY,
  dismissed_by uuid REFERENCES public.profiles(id),
  dismissed_at timestamptz DEFAULT now()
);

CREATE TABLE public.agent_suggestions (
  card_id text PRIMARY KEY,
  input_hash text NOT NULL,          -- hash faktów; zmiana faktów = nowa sugestia
  suggestion text NOT NULL,
  draft text,
  priority text,
  model text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_dismissed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_suggestions ENABLE ROW LEVEL SECURITY;
-- Dostęp tylko przez service_role z checkiem requireAdmin() w kodzie serwera;
-- brak polityk dla anon/auth — celowo, tak jak przy landing_leads.

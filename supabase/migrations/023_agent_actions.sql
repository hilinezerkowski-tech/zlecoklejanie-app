-- =============================================
-- Agent AI — Faza 5: przyciski wykonują akcje
-- =============================================

-- Dziennik akcji admina wykonanych z panelu agenta (brief zakładał, że tabela
-- istnieje — w bazie jej nie było).
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  admin_id uuid REFERENCES public.profiles(id),
  entity text NOT NULL,              -- 'agent'
  action text NOT NULL,              -- assign_studio / activate_studio / request_info / reply_email / reply_social
  entity_id text,                    -- id karty agenta
  payload jsonb,
  result text NOT NULL,              -- 'ok' | 'error'
  error text
);
CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON public.admin_actions (created_at DESC);
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;
-- Brak polityk: dostęp tylko service_role po requireAdmin() w kodzie serwera.

-- Karta "załatwiona" (akcja wykonana) nie ma wracać w "Pokaż ukryte" jak
-- zwykłe "Później".
ALTER TABLE public.agent_dismissed
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT 'dismissed';  -- 'dismissed' | 'done'

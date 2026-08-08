-- 005: Fix polityki RLS "Studio can view assigned orders".
-- Bug: niekwalifikowane `id` w subquery wiazalo sie z order_assignments.id
-- zamiast orders.id (warunek order_id = id zawsze falszywy) -> studio nigdy
-- nie widzialo przypisanych zlecen. Ten sam bug jest w 001 (nie edytujemy 001,
-- ta migracja nadpisuje polityke poprawna wersja z kwalifikacja orders.id).
-- Zastosowane recznie na produkcji 2026-08-08.

DROP POLICY IF EXISTS "Studio can view assigned orders" ON public.orders;
CREATE POLICY "Studio can view assigned orders" ON public.orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.order_assignments oa
      WHERE oa.order_id = orders.id AND oa.studio_id = auth.uid()
    )
  );

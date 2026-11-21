-- =============================================
-- 034_platnosci_p24.sql
-- Gate 1, Faza 2: zaksięgowanie płatności Przelewy24 (doładowanie punktów).
--
-- Webhook /api/p24/webhook po sprawdzeniu podpisu i PUT /transaction/verify woła
-- zaksieguj_platnosc() kluczem service role. Funkcja jest idempotentna: P24 potrafi
-- wysłać powiadomienie kilka razy — punkty dopisują się tylko raz (status 'oczekuje' → 'zaplacono').
-- Wymaga migracji 033. Migracja idempotentna; uruchamia Wojtek w SQL Editorze.
-- =============================================

CREATE OR REPLACE FUNCTION public.zaksieguj_platnosc(p_platnosc uuid, p_p24_order_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_studio uuid;
  v_punkty int;
  v_kwota  numeric;
  v_saldo  int;
  v_ruch   uuid;
BEGIN
  UPDATE platnosci
     SET status = 'zaplacono', p24_order_id = p_p24_order_id, zaplacono_at = now()
   WHERE id = p_platnosc AND status = 'oczekuje'
  RETURNING studio_id, punkty_kupione, kwota INTO v_studio, v_punkty, v_kwota;

  IF v_studio IS NULL THEN
    -- Już zaksięgowana albo nie istnieje — nic nie dopisujemy.
    RETURN jsonb_build_object('zaksiegowano', false);
  END IF;

  INSERT INTO punkty_studia (studio_id, saldo, zrodlo_ostatniej_zmiany)
  VALUES (v_studio, v_punkty, 'platnosc_p24')
  ON CONFLICT (studio_id) DO UPDATE
     SET saldo = punkty_studia.saldo + EXCLUDED.saldo,
         zrodlo_ostatniej_zmiany = 'platnosc_p24',
         updated_at = now()
  RETURNING saldo INTO v_saldo;

  INSERT INTO punkty_ruchy (studio_id, zmiana, saldo_po, zrodlo, platnosc_id)
  VALUES (v_studio, v_punkty, v_saldo, 'platnosc_p24', p_platnosc)
  RETURNING id INTO v_ruch;

  INSERT INTO admin_actions (admin_id, entity, action, entity_id, payload, result)
  VALUES (NULL, 'punkty', 'platnosc_p24', v_studio::text,
          jsonb_build_object('platnoscId', p_platnosc, 'p24OrderId', p_p24_order_id, 'punkty', v_punkty,
                             'kwota', v_kwota, 'saldoPo', v_saldo, 'ruchId', v_ruch), 'ok');

  RETURN jsonb_build_object('zaksiegowano', true, 'studioId', v_studio, 'punkty', v_punkty, 'saldoPo', v_saldo);
END;
$fn$;

-- Tylko serwer (service role) — nigdy z przeglądarki.
REVOKE EXECUTE ON FUNCTION public.zaksieguj_platnosc(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.zaksieguj_platnosc(uuid, bigint) TO service_role;

-- =============================================
-- 003 — wybór oferty przez klienta (RPC SECURITY DEFINER)
-- Klient nie ma uprawnien RLS do UPDATE orders/quotes ani dostepu
-- do order_assignments, wiec caly wybor rozstrzyga funkcja
-- uruchamiana z uprawnieniami wlasciciela.
-- =============================================

create or replace function public.choose_quote(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id  uuid;
  v_studio_id uuid;
  v_client_id uuid;
  v_status    order_status;
begin
  -- Pobierz wycene wraz z jej zleceniem
  select q.order_id, q.studio_id
    into v_order_id, v_studio_id
    from public.quotes q
   where q.id = p_quote_id;

  if v_order_id is null then
    raise exception 'Wycena nie istnieje';
  end if;

  -- Zweryfikuj, ze zlecenie nalezy do wywolujacego klienta
  select o.client_id, o.status
    into v_client_id, v_status
    from public.orders o
   where o.id = v_order_id;

  if v_client_id is null or v_client_id <> auth.uid() then
    raise exception 'Brak uprawnien do tego zlecenia';
  end if;

  if v_status in ('chosen', 'completed', 'cancelled') then
    raise exception 'To zlecenie zostalo juz rozstrzygniete';
  end if;

  -- Wybrana oferta -> chosen, pozostale -> rejected
  update public.quotes set status = 'chosen'
   where id = p_quote_id;
  update public.quotes set status = 'rejected'
   where order_id = v_order_id and id <> p_quote_id;

  -- Przypisania: wybrane studio -> chosen, pozostale -> rejected
  update public.order_assignments set status = 'chosen'
   where order_id = v_order_id and studio_id = v_studio_id;
  update public.order_assignments set status = 'rejected'
   where order_id = v_order_id and studio_id <> v_studio_id;

  -- Zlecenie -> chosen
  update public.orders
     set status = 'chosen',
         chosen_quote_id = p_quote_id,
         chosen_at = now()
   where id = v_order_id;

  -- Powiadom wybrane studio
  insert into public.notifications (user_id, type, title, body, data)
  values (
    v_studio_id,
    'chosen',
    'Twoja oferta zostala wybrana!',
    'Klient wybral Twoja wycene. Skontaktuj sie, aby ustalic szczegoly realizacji.',
    jsonb_build_object('order_id', v_order_id, 'quote_id', p_quote_id)
  );
end;
$$;

grant execute on function public.choose_quote(uuid) to authenticated;

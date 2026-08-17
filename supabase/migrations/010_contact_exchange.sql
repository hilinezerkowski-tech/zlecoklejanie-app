-- =============================================
-- 010_contact_exchange.sql
-- Wymiana danych kontaktowych po rozstrzygnieciu zlecenia.
--
-- PROBLEM: RLS na `profiles` udostepnia wiersz wylacznie wlascicielowi,
-- a tabela `studios` nie ma telefonu. Po wyborze oferty klient i studio
-- nie mieli zadnej sciezki do siebie w panelu — jedynym kanalem byl mail
-- z Resend (best-effort, moze nie dojsc). To rozwalalo rdzen produktu.
--
-- ROZWIAZANIE: funkcja SECURITY DEFINER, ktora wydaje kontakt DRUGIEJ
-- STRONY, i tylko wtedy gdy:
--   1. zlecenie jest rozstrzygniete (status chosen/completed),
--   2. wywolujacy jest jego klientem albo wybranym studiem.
-- W kazdym innym przypadku zwraca zero wierszy (a przy jawnie obcym
-- uzytkowniku — wyjatek), wiec nie da sie jej uzyc do zaciagania bazy
-- kontaktow przez iterowanie po uuid.
--
-- Migracja jest idempotentna.
-- =============================================

drop function if exists public.get_order_contact(uuid);

create function public.get_order_contact(p_order_id uuid)
returns table (
  party         text,   -- czyj to kontakt: 'studio' albo 'client'
  display_name  text,
  email         text,
  phone         text,
  location      text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_status    order_status;
  v_studio_id uuid;
  v_caller    uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Brak zalogowanego uzytkownika';
  end if;

  select o.client_id, o.status
    into v_client_id, v_status
    from public.orders o
   where o.id = p_order_id;

  if v_client_id is null then
    raise exception 'Zlecenie nie istnieje';
  end if;

  -- Kontakt uwalniamy dopiero po rozstrzygnieciu. Przed wyborem oferty
  -- studia nie moga omijac platformy, a klient nie dostaje spamu.
  if v_status not in ('chosen', 'completed') then
    return;
  end if;

  -- Wybrane studio — po wycenie ze statusem 'chosen'
  select q.studio_id
    into v_studio_id
    from public.quotes q
   where q.order_id = p_order_id
     and q.status = 'chosen'
   limit 1;

  if v_studio_id is null then
    return;
  end if;

  if v_caller = v_client_id then
    -- Klientowi wydajemy kontakt do studia
    return query
    select
      'studio'::text,
      coalesce(nullif(s.business_name, ''), p.full_name, 'Wybrane studio')::text,
      p.email::text,
      p.phone::text,
      coalesce(s.address, p.city)::text
    from public.profiles p
    left join public.studios s on s.id = p.id
    where p.id = v_studio_id;

  elsif v_caller = v_studio_id then
    -- Studiu wydajemy kontakt do klienta
    return query
    select
      'client'::text,
      coalesce(nullif(p.full_name, ''), 'Klient')::text,
      p.email::text,
      p.phone::text,
      coalesce(o.city, p.city)::text
    from public.profiles p
    join public.orders o on o.id = p_order_id
    where p.id = v_client_id;

  else
    raise exception 'Brak uprawnien do tego zlecenia';
  end if;
end;
$$;

comment on function public.get_order_contact(uuid) is
  'Wydaje dane kontaktowe drugiej strony rozstrzygnietego zlecenia. Tylko dla klienta i wybranego studia.';

revoke all on function public.get_order_contact(uuid) from public, anon;
grant execute on function public.get_order_contact(uuid) to authenticated;

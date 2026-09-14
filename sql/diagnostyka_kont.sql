-- ============================================================
-- DIAGNOSTYKA KONT: Kamil (Diamentowy Połysk) + Studio2m (KolorBryki)
-- Uruchom w Supabase SQL Editor:
-- https://supabase.com/dashboard/project/puhbcpahnecunwirtgsj/sql/new
-- ============================================================

-- 1. Szukamy kont po business_name w studios
SELECT
  s.id,
  s.business_name,
  s.status AS studio_status,
  s.address,
  p.email,
  p.role,
  p.phone,
  u.email AS auth_email,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.created_at AS auth_created,
  u.raw_user_meta_data->>'role' AS meta_role,
  (SELECT COUNT(*) FROM auth.identities i WHERE i.user_id = u.id) AS identity_count
FROM studios s
LEFT JOIN profiles p ON p.id = s.id
LEFT JOIN auth.users u ON u.id = s.id
WHERE s.business_name ILIKE '%Diamentowy%'
   OR s.business_name ILIKE '%KolorBryki%'
   OR s.business_name ILIKE '%Studio2m%'
ORDER BY s.business_name;

-- 2. Alternatywnie: szukamy Kamila po emailu
SELECT
  u.id,
  u.email,
  u.email_confirmed_at,
  u.last_sign_in_at,
  u.created_at,
  u.raw_user_meta_data,
  (SELECT COUNT(*) FROM auth.identities i WHERE i.user_id = u.id) AS identity_count,
  p.role AS profile_role,
  s.business_name,
  s.status AS studio_status
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN studios s ON s.id = u.id
WHERE u.email = 'diamentowypolysk@gmail.com';

-- 3. Wszystkie aktywne studia — pełny przegląd
SELECT
  s.id,
  s.business_name,
  s.status AS studio_status,
  p.email,
  p.role AS profile_role,
  u.email AS auth_email,
  u.email_confirmed_at IS NOT NULL AS email_confirmed,
  u.last_sign_in_at,
  (SELECT COUNT(*) FROM auth.identities i WHERE i.user_id = u.id) AS identity_count
FROM studios s
LEFT JOIN profiles p ON p.id = s.id
LEFT JOIN auth.users u ON u.id = s.id
ORDER BY s.business_name;

-- 4. Sprawdzenie RLS na studios (czy jest włączone)
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('studios', 'profiles', 'orders')
ORDER BY relname;

-- 5. Polityki RLS na studios
SELECT
  policyname,
  cmd AS operation,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE tablename = 'studios'
ORDER BY policyname;

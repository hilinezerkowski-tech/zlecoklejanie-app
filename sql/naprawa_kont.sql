-- ============================================================
-- NAPRAWA KONT — uruchomić PO diagnostyce
-- Supabase SQL Editor:
-- https://supabase.com/dashboard/project/puhbcpahnecunwirtgsj/sql/new
-- ============================================================

-- ============================================================
-- SCENARIUSZ A: Studio ma auth.users + profiles, ale BRAK studios
-- (Studio2m KolorBryki — prawdopodobny problem)
-- → Trzeba wstawić brakujący rekord studios
-- ============================================================

-- KROK 1: Znajdź user_id
-- SELECT id, email FROM auth.users WHERE email = '<EMAIL_STUDIO2M>';

-- KROK 2: Wstaw rekord studios (zamień <USER_ID> i <NAZWA>)
/*
BEGIN;
  -- Tworzymy brakujący rekord studios dla użytkownika
  INSERT INTO studios (id, business_name, status)
  VALUES ('<USER_ID>', '<NAZWA>', 'active')
  ON CONFLICT (id) DO NOTHING;

  -- Weryfikacja
  SELECT id, business_name, status FROM studios WHERE id = '<USER_ID>';
COMMIT;
*/

-- ============================================================
-- SCENARIUSZ B: Studio ma auth.users ale BEZ auth.identities
-- (Kamil — jeśli problem się powtórzył)
-- → Konto trzeba usunąć i dodać ponownie przez /admin/studia
-- ============================================================

-- KROK 1: Sprawdź identities
-- SELECT * FROM auth.identities WHERE user_id = '<USER_ID>';

-- Jeśli identities = 0, konto trzeba usunąć i odtworzyć:
/*
BEGIN;
  -- Uwaga: CASCADE usunie też profiles i studios
  DELETE FROM auth.users WHERE id = '<USER_ID>';
  -- Weryfikacja
  SELECT COUNT(*) AS remaining FROM auth.users WHERE email = 'diamentowypolysk@gmail.com';
COMMIT;
*/
-- Potem: dodaj ponownie przez /admin/studia na zlecoklejanie-app.vercel.app

-- ============================================================
-- SCENARIUSZ C: profiles.role nie jest 'studio'
-- → Middleware blokuje dostęp do /studio/*
-- ============================================================

/*
BEGIN;
  UPDATE profiles SET role = 'studio' WHERE id = '<USER_ID>';
  -- Weryfikacja
  SELECT id, email, role FROM profiles WHERE id = '<USER_ID>';
COMMIT;
*/

-- ============================================================
-- SCENARIUSZ D: Wygeneruj nowy magic link dla studia
-- → Nie da się z SQL. Użyj panelu admina:
--   1. Wejdź na zlecoklejanie-app.vercel.app/login (hasłem jako admin)
--   2. Nie ma jeszcze "wyślij ponownie" — studio może samo poprosić
--      o link na /login wpisując swój email
-- ============================================================

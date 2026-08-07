-- 004: Fix handle_new_user — SECURITY DEFINER bez search_path powodowal
-- blad "Failed to create user: {}" przy auth.admin.createUser (typ user_role
-- nie rozwiazywal sie w DECLARE, funkcja padala przed blokiem EXCEPTION).
-- Fix: SET search_path = public + w pelni kwalifikowane typy + defensywny EXCEPTION.
-- Zastosowane recznie na produkcji 2026-08-07.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.user_role;
BEGIN
  -- Cast roli z metadanych; nieprawidlowa wartosc -> NULL -> fallback 'client'
  BEGIN
    _role := (new.raw_user_meta_data->>'role')::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    _role := NULL;
  END;

  -- Insert profilu; nigdy nie blokuj utworzenia konta auth
  BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, COALESCE(_role, 'client'::public.user_role))
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  END;

  RETURN new;
END;
$$;

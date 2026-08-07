import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Klient Supabase z kluczem SERVICE ROLE.
 *
 * UWAGA: używać WYŁĄCZNIE po stronie serwera (Server Actions / Route Handlers).
 * Klucz `SUPABASE_SERVICE_ROLE_KEY` nie ma prefiksu NEXT_PUBLIC_, więc nigdy
 * nie trafia do przeglądarki. Ten klient OMIJA RLS — nie wolno go eksportować
 * do komponentów klienckich ani zwracać jego wyników bez kontroli uprawnień.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Brak konfiguracji: NEXT_PUBLIC_SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

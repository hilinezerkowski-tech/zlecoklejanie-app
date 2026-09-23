-- 019_order_photos_storage.sql
-- Prywatny bucket na zdjecia zgloszen (auto klienta / grafika w zleceniu).
-- Dostep wylacznie przez service_role po stronie serwera (signed URL) —
-- brak polityk RLS = anon/authenticated nie maja bezposredniego dostepu.
-- orders.photos (TEXT[]) trzyma SCIEZKI w tym buckecie, nie URL-e.

INSERT INTO storage.buckets (id, name, public)
VALUES ('order-photos', 'order-photos', false)
ON CONFLICT (id) DO NOTHING;

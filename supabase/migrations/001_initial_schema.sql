-- =============================================
-- ZlecOklejanie.pl — schemat bazy danych v1
-- =============================================

-- Typy ENUM
CREATE TYPE user_role AS ENUM ('client', 'studio', 'designer', 'admin');
CREATE TYPE studio_status AS ENUM ('pending', 'active', 'suspended', 'rejected');
CREATE TYPE order_status AS ENUM ('new', 'assigned', 'quoted', 'chosen', 'completed', 'cancelled');
CREATE TYPE service_type AS ENUM ('oklejanie', 'ppf', 'branding', 'grafika', 'inne');
CREATE TYPE order_scope AS ENUM ('full', 'full_wneki', 'partial', 'front');
CREATE TYPE assignment_status AS ENUM ('pending', 'quoted', 'rejected', 'chosen');
CREATE TYPE quote_status AS ENUM ('sent', 'viewed', 'chosen', 'rejected');

-- =============================================
-- profiles — rozszerzenie auth.users
-- =============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'client',
  full_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  city TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ
);

-- Trigger: auto-tworzenie profilu przy rejestracji
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(
      (new.raw_user_meta_data->>'role')::user_role,
      'client'::user_role
    )
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- studios — dane studia
-- =============================================
CREATE TABLE studios (
  id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  business_name TEXT,
  nip TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  specializations TEXT[] DEFAULT '{}',
  foil_brands TEXT[] DEFAULT '{}',
  instagram TEXT,
  website TEXT,
  address TEXT,
  working_hours JSONB,
  service_radius_km INTEGER DEFAULT 50,
  gallery JSONB DEFAULT '[]',
  google_rating DECIMAL(2,1),
  google_reviews_count INTEGER DEFAULT 0,
  status studio_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- orders — zlecenia klientów
-- =============================================
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES profiles(id),
  service_type service_type NOT NULL DEFAULT 'oklejanie',
  car_brand TEXT,
  car_model TEXT,
  car_year INTEGER,
  scope order_scope DEFAULT 'full',
  city TEXT NOT NULL,
  description TEXT,
  photos TEXT[] DEFAULT '{}',
  estimated_min INTEGER,
  estimated_max INTEGER,
  status order_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at TIMESTAMPTZ,
  chosen_at TIMESTAMPTZ,
  chosen_quote_id UUID
);

-- =============================================
-- order_assignments — przypisanie zleceń do studiów (max 3)
-- =============================================
CREATE TABLE order_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES studios(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES profiles(id),
  status assignment_status NOT NULL DEFAULT 'pending',
  UNIQUE(order_id, studio_id)
);

-- Constraint: max 3 aktywne przypisania per zlecenie
CREATE OR REPLACE FUNCTION check_max_assignments()
RETURNS trigger AS $$
BEGIN
  IF (SELECT COUNT(*) FROM order_assignments 
      WHERE order_id = NEW.order_id AND status != 'rejected') >= 3 THEN
    RAISE EXCEPTION 'Maksymalnie 3 studia mogą być przypisane do zlecenia';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_max_3_assignments
  BEFORE INSERT ON order_assignments
  FOR EACH ROW EXECUTE FUNCTION check_max_assignments();

-- =============================================
-- quotes — wyceny studiów
-- =============================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES studios(id),
  assignment_id UUID NOT NULL REFERENCES order_assignments(id),
  price_min INTEGER NOT NULL,
  price_max INTEGER,
  comment TEXT,
  estimated_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status quote_status NOT NULL DEFAULT 'sent'
);

-- =============================================
-- notifications
-- =============================================
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_orders_client ON orders(client_id, created_at DESC);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_assignments_studio ON order_assignments(studio_id, status);
CREATE INDEX idx_assignments_order ON order_assignments(order_id);
CREATE INDEX idx_quotes_order ON quotes(order_id);
CREATE INDEX idx_studios_status ON studios(status);
CREATE INDEX idx_studios_slug ON studios(slug);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- profiles: każdy widzi swój
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
-- Admin widzi wszystkie profile
CREATE POLICY "Admin can view all profiles" ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- studios: publiczne (aktywne), edycja własnego
CREATE POLICY "Public can view active studios" ON studios FOR SELECT USING (status = 'active');
CREATE POLICY "Studio can view own" ON studios FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Studio can update own" ON studios FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin full access studios" ON studios FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- orders: klient widzi swoje, studio widzi przypisane, admin widzi wszystkie
CREATE POLICY "Client can view own orders" ON orders FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Client can insert orders" ON orders FOR INSERT WITH CHECK (client_id = auth.uid());
CREATE POLICY "Studio can view assigned orders" ON orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM order_assignments WHERE order_id = id AND studio_id = auth.uid())
);
CREATE POLICY "Admin full access orders" ON orders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- order_assignments: studio widzi swoje, admin pełny dostęp
CREATE POLICY "Studio can view own assignments" ON order_assignments FOR SELECT USING (studio_id = auth.uid());
CREATE POLICY "Admin full access assignments" ON order_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- quotes: studio widzi/tworzy swoje, klient widzi na swoje zlecenia
CREATE POLICY "Studio can manage own quotes" ON quotes FOR ALL USING (studio_id = auth.uid());
CREATE POLICY "Client can view quotes on own orders" ON quotes FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE id = order_id AND client_id = auth.uid())
);
CREATE POLICY "Admin full access quotes" ON quotes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- notifications: tylko swoje
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);


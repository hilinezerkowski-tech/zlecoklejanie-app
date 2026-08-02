export type UserRole = "client" | "studio" | "designer" | "admin";
export type StudioStatus = "pending" | "active" | "suspended" | "rejected";
export type OrderStatus = "new" | "assigned" | "quoted" | "chosen" | "completed" | "cancelled";
export type ServiceType = "oklejanie" | "ppf" | "branding" | "grafika" | "inne";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
  created_at: string;
  verified: boolean;
  verified_at: string | null;
}

export interface Studio {
  id: string;
  business_name: string | null;
  nip: string | null;
  slug: string | null;
  description: string | null;
  specializations: string[];
  foil_brands: string[];
  instagram: string | null;
  website: string | null;
  address: string | null;
  working_hours: Record<string, string> | null;
  service_radius_km: number;
  gallery: string[];
  google_rating: number | null;
  google_reviews_count: number;
  status: StudioStatus;
  rejection_reason: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  client_id: string;
  service_type: ServiceType;
  car_brand: string | null;
  car_model: string | null;
  car_year: number | null;
  scope: string;
  city: string;
  description: string | null;
  photos: string[];
  estimated_min: number | null;
  estimated_max: number | null;
  status: OrderStatus;
  created_at: string;
  assigned_at: string | null;
  chosen_at: string | null;
  chosen_quote_id: string | null;
}

export interface Quote {
  id: string;
  order_id: string;
  studio_id: string;
  assignment_id: string;
  price_min: number;
  price_max: number | null;
  comment: string | null;
  estimated_days: number | null;
  created_at: string;
  status: string;
}

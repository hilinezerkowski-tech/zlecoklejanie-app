import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getReviewsAdmin } from "./actions";
import { ReviewsList } from "./reviews-list";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
}

export const dynamic = "force-dynamic";

type Review = {
  id: string;
  created_at: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  status: string;
  studio: { business_name: string | null; slug: string | null } | null;
};

export default async function ReviewsAdminPage() {
  await requireAdmin();
  const reviews = (await getReviewsAdmin()) as unknown as Review[];
  const pending = reviews.filter((r) => r.status === "pending");
  const others = reviews.filter((r) => r.status !== "pending");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Opinie</h1>
        <p className="text-sm text-brand-chrom mt-1">
          Moderacja opinii klientów — publikowane pojawiają się na profilu wykonawcy.
        </p>
      </div>
      <ReviewsList pending={pending} others={others} />
    </div>
  );
}

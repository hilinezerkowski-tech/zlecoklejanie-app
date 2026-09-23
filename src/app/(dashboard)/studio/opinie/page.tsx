import { createClient } from "@/lib/supabase/server";
import { ReviewReplyForm } from "@/components/ui/review-reply-form";

export const dynamic = "force-dynamic";

type Review = {
  id: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  reply: string | null;
  created_at: string;
};

export default async function StudioReviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("reviews")
    .select("id, author_name, rating, comment, reply, created_at")
    .eq("studio_id", user!.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  const reviews = (data as Review[]) ?? [];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Opinie</h1>
      <p className="text-sm text-brand-chrom mb-6">
        Opublikowane opinie klientów. Możesz odpowiedzieć — odpowiedź jest
        widoczna na Twoim profilu publicznym.
      </p>

      {reviews.length === 0 ? (
        <p className="text-sm text-brand-chrom">Nie masz jeszcze opinii.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="bg-brand-grafit-light border border-brand-border rounded-2xl p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{r.author_name}</span>
                <span className="text-brand-lime">
                  {"★".repeat(r.rating)}
                  <span className="text-brand-border">
                    {"★".repeat(5 - r.rating)}
                  </span>
                </span>
              </div>
              {r.comment && (
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
                  {r.comment}
                </p>
              )}
              <p className="mt-1 text-xs text-brand-chrom">
                {new Date(r.created_at).toLocaleDateString("pl-PL")}
              </p>
              {r.reply && (
                <div className="mt-3 rounded-lg border-l-2 border-brand-lime bg-brand-grafit px-3 py-2">
                  <p className="text-xs font-semibold text-brand-lime mb-1">
                    Twoja odpowiedź
                  </p>
                  <p className="whitespace-pre-line text-sm">{r.reply}</p>
                </div>
              )}
              <ReviewReplyForm reviewId={r.id} initial={r.reply} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

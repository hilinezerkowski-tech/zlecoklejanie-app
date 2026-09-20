import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Licznik nieprzeczytanych wiadomości od admina (RLS: studio widzi tylko swoje).
  // Brak tabeli/migracji => count null => brak plakietki, panel działa dalej.
  let badges: Record<string, number> | undefined;
  if (profile.role === "studio") {
    const { count } = await supabase
      .from("studio_messages")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", user.id)
      .is("read_at", null)
      .in("channel", ["both", "panel"]);
    badges = { "/studio/wiadomosci": count || 0 };
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        role={profile.role}
        name={profile.full_name || profile.email}
        email={profile.email}
        avatarUrl={profile.avatar_url}
        badges={badges}
      />
      <main className="flex-1 md:ml-64 p-4 pt-[72px] md:p-8 md:pt-8">
        {children}
      </main>
    </div>
  );
}

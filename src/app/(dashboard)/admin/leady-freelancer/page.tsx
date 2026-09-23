import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFreelancerLeads } from "./actions";
import { FreelancerLeadsList } from "./leads-list";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");
}

export const dynamic = "force-dynamic";

export default async function FreelancerLeadsPage() {
  await requireAdmin();
  const leads = await getFreelancerLeads();

  const counts = {
    total: leads.length,
    nowy: leads.filter(l => l.status === "nowy").length,
    dm_wyslany: leads.filter(l => l.status === "dm_wyslany").length,
    odpowiedzial: leads.filter(l => l.status === "odpowiedzial").length,
    zarejestrowany: leads.filter(l => l.status === "zarejestrowany").length,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Leady — Wrapperzy mobilni</h1>
          <p className="text-sm text-gray-400 mt-1">
            Kandydaci z IG/FB przed rejestracją — {counts.total} łącznie
          </p>
        </div>
      </div>

      {/* Statystyki */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Nowi", val: counts.nowy, color: "text-gray-300" },
          { label: "DM wysłany", val: counts.dm_wyslany, color: "text-amber-400" },
          { label: "Odpowiedział", val: counts.odpowiedzial, color: "text-brand-lime" },
          { label: "Zarejestrowany", val: counts.zarejestrowany, color: "text-teal-400" },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-brand-card border border-white/10 rounded-xl p-4">
            <div className={`text-2xl font-bold ${color}`}>{val}</div>
            <div className="text-xs text-gray-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <FreelancerLeadsList leads={leads} />
    </div>
  );
}

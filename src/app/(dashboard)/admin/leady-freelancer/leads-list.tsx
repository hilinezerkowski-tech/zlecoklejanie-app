"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateLeadStatus, updateLeadScore, addFreelancerLead } from "./actions";

type Lead = {
  id: string;
  created_at: string;
  source: string;
  handle: string | null;
  name: string | null;
  city: string | null;
  phone: string | null;
  instagram_url: string | null;
  score: number | null;
  status: string;
  contacted_at: string | null;
  notes: string | null;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  nowy: { label: "Nowy", color: "bg-gray-400/15 text-gray-300" },
  dm_wyslany: { label: "DM wysłany", color: "bg-amber-400/15 text-amber-400" },
  odpowiedzial: { label: "Odpowiedział", color: "bg-brand-lime/15 text-brand-lime" },
  zarejestrowany: { label: "Zarejestrowany", color: "bg-teal-400/15 text-teal-400" },
  odrzucony: { label: "Odrzucony", color: "bg-red-400/15 text-red-400" },
};

const SOURCE_LABELS: Record<string, string> = {
  instagram: "IG",
  fb_group: "FB",
  olx: "OLX",
  polecenie: "Polecenie",
};

function ScorePicker({ leadId, score }: { leadId: string; score: number | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function set(v: number) {
    setLoading(true);
    await updateLeadScore(leadId, v);
    router.refresh();
    setLoading(false);
  }
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(v => (
        <button
          key={v}
          onClick={() => set(v)}
          disabled={loading}
          className={`text-lg leading-none transition ${v <= (score ?? 0) ? "opacity-100" : "opacity-25"}`}
          title={`Ocena ${v}/5`}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

function StatusSelect({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function onChange(v: string) {
    setLoading(true);
    await updateLeadStatus(leadId, v);
    router.refresh();
    setLoading(false);
  }
  return (
    <select
      value={status}
      onChange={e => onChange(e.target.value)}
      disabled={loading}
      className="text-xs px-2 py-1 bg-brand-grafit border border-brand-border rounded-lg text-brand-kosc focus:outline-none focus:border-brand-lime disabled:opacity-50"
    >
      {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
        <option key={v} value={v}>{label}</option>
      ))}
    </select>
  );
}

function AddLeadForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ source: "instagram", handle: "", name: "", city: "", phone: "", instagram_url: "", notes: "" });
  function u(k: string, v: string) { setForm(p => ({ ...p, [k]: v })); }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await addFreelancerLead({
      source: form.source,
      handle: form.handle || undefined,
      name: form.name || undefined,
      city: form.city || undefined,
      phone: form.phone || undefined,
      instagram_url: form.instagram_url || undefined,
      notes: form.notes || undefined,
    });
    if (!res.ok) { setErr(res.error || "Błąd"); setLoading(false); return; }
    router.refresh();
    onClose();
  }
  return (
    <div className="mb-6 bg-brand-grafit-light border border-brand-border rounded-2xl p-5">
      <h3 className="font-semibold mb-4">Dodaj lead ręcznie</h3>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Źródło</label>
          <select value={form.source} onChange={e => u("source", e.target.value)}
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime">
            <option value="instagram">Instagram</option>
            <option value="fb_group">Grupy FB</option>
            <option value="olx">OLX/Oferteo</option>
            <option value="polecenie">Polecenie</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Handle / nick</label>
          <input type="text" value={form.handle} onChange={e => u("handle", e.target.value)} placeholder="@wrapper_marek"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Imię / nazwa</label>
          <input type="text" value={form.name} onChange={e => u("name", e.target.value)} placeholder="Marek W."
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Miasto</label>
          <input type="text" value={form.city} onChange={e => u("city", e.target.value)} placeholder="Warszawa"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Instagram URL</label>
          <input type="url" value={form.instagram_url} onChange={e => u("instagram_url", e.target.value)} placeholder="https://instagram.com/..."
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime" />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Telefon</label>
          <input type="text" value={form.phone} onChange={e => u("phone", e.target.value)} placeholder="+48 600 000 000"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Notatki</label>
          <textarea value={form.notes} onChange={e => u("notes", e.target.value)} rows={2} placeholder="np. dobre portfolio, specjalizacja PPF"
            className="w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc focus:outline-none focus:border-brand-lime resize-none" />
        </div>
        <div className="sm:col-span-2 flex gap-3">
          <button type="submit" disabled={loading}
            className="px-4 py-2 bg-brand-lime text-black font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50">
            {loading ? "Dodawanie..." : "Dodaj lead"}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 border border-white/20 text-sm rounded-xl hover:bg-white/5 transition">
            Anuluj
          </button>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      </form>
    </div>
  );
}

export function FreelancerLeadsList({ leads }: { leads: Lead[] }) {
  const [showAdd, setShowAdd] = useState(false);

  function copyDm(lead: Lead) {
    const name = lead.name || lead.handle || "Hej";
    const city = lead.city ? ` z okolic ${lead.city}` : "";
    const text = `Cześć ${name}! Tworzę portal ZlecOklejanie.pl${city} — łączę klientów z wrapperami. Czy byłbyś zainteresowany bezpłatnym profilem i zleceniami z okolicy? 🎯`;
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div>
      <div className="mb-4">
        {showAdd ? (
          <AddLeadForm onClose={() => setShowAdd(false)} />
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-brand-lime text-black font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition">
            + Dodaj lead ręcznie
          </button>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>Brak leadów. Dodaj pierwszego kandydata ręcznie lub poczekaj na zgłoszenia z formularza.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(lead => {
            const st = STATUS_LABELS[lead.status] || { label: lead.status, color: "bg-gray-400/15 text-gray-300" };
            return (
              <div key={lead.id} className="bg-brand-card border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {lead.instagram_url ? (
                        <a href={lead.instagram_url} target="_blank" rel="noopener"
                          className="font-semibold text-brand-text hover:text-brand-lime transition-colors">
                          {lead.name || lead.handle || "Bez nazwy"}
                        </a>
                      ) : (
                        <span className="font-semibold">{lead.name || lead.handle || "Bez nazwy"}</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                        {SOURCE_LABELS[lead.source] || lead.source}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 mb-2">
                      {lead.city && <span>📍 {lead.city}</span>}
                      {lead.handle && <span>@ {lead.handle}</span>}
                      {lead.phone && <span>📞 {lead.phone}</span>}
                      <span>📅 {new Date(lead.created_at).toLocaleDateString("pl-PL")}</span>
                    </div>
                    {lead.notes && <p className="text-xs text-gray-500 italic">{lead.notes}</p>}
                    <div className="mt-2">
                      <ScorePicker leadId={lead.id} score={lead.score} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusSelect leadId={lead.id} status={lead.status} />
                    <button
                      onClick={() => copyDm(lead)}
                      title="Kopiuj wiadomość DM"
                      className="text-xs px-3 py-1.5 border border-white/20 rounded-lg hover:bg-white/5 transition"
                    >
                      📋 DM
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

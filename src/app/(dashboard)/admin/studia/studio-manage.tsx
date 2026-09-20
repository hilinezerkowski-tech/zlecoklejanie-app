"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  sendStudioMessage,
  setStudioDeleted,
  updateStudio,
  type StudioMessageInput,
} from "./actions";

export type ManagedStudio = {
  id: string;
  business_name: string | null;
  address: string | null;
  instagram: string | null;
  specializations: string[] | null;
  status: string;
  email: string | null;
  phone: string | null;
};

const inputCls =
  "w-full px-3 py-2 bg-brand-grafit border border-brand-border rounded-xl text-sm text-brand-kosc placeholder:text-brand-chrom/40 focus:outline-none focus:border-brand-lime transition";
const labelCls = "block text-xs text-brand-chrom mb-1";
const btnCls =
  "px-3 py-1.5 text-xs rounded-lg transition font-medium bg-white/5 text-brand-chrom hover:text-brand-kosc hover:bg-white/10";

const statusOptions = [
  { value: "pending", label: "Oczekuje" },
  { value: "active", label: "Aktywne" },
  { value: "suspended", label: "Zawieszone" },
  { value: "rejected", label: "Odrzucone" },
];

const channelOptions: { value: StudioMessageInput["channel"]; label: string }[] = [
  { value: "both", label: "Mail + panel" },
  { value: "email", label: "Tylko mail" },
  { value: "panel", label: "Tylko panel" },
];

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90dvh] overflow-y-auto bg-brand-grafit-light border border-brand-border rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-sm text-brand-chrom hover:text-brand-kosc transition"
          >
            Zamknij ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Edytuj / Wiadomość / Usuń — dokładane obok „Zweryfikuj / Zawieś". */
export function StudioManage({ studio }: { studio: ManagedStudio }) {
  const router = useRouter();
  const [modal, setModal] = useState<null | "edit" | "message" | "delete">(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const name = studio.business_name || "Bez nazwy";

  const [form, setForm] = useState({
    business_name: studio.business_name || "",
    address: studio.address || "",
    email: studio.email || "",
    phone: studio.phone || "",
    instagram: studio.instagram || "",
    specializations: (studio.specializations || []).join(", "),
    status: studio.status,
  });
  const [msg, setMsg] = useState<StudioMessageInput>({
    subject: "",
    body: "",
    channel: "both",
  });

  function open(which: "edit" | "message" | "delete") {
    setError("");
    setSuccess("");
    setModal(which);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await updateStudio(studio.id, form);
    setLoading(false);
    if (!res.ok) return setError(res.error || "Nieznany błąd.");
    setModal(null);
    router.refresh();
  }

  async function handleMessage(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    const res = await sendStudioMessage(studio.id, msg);
    setLoading(false);
    if (!res.ok) return setError(res.error || "Nieznany błąd.");
    setSuccess(res.message || "Wysłano.");
    setMsg({ subject: "", body: "", channel: msg.channel });
  }

  async function handleDelete() {
    setLoading(true);
    setError("");
    const res = await setStudioDeleted(studio.id, true);
    setLoading(false);
    if (!res.ok) return setError(res.error || "Nieznany błąd.");
    setModal(null);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => open("edit")} className={btnCls}>
        Edytuj
      </button>
      <button onClick={() => open("message")} className={btnCls}>
        Wiadomość
      </button>
      <button
        onClick={() => open("delete")}
        className="px-3 py-1.5 text-xs bg-red-400/15 text-red-400 rounded-lg hover:bg-red-400/25 transition font-medium"
      >
        Usuń
      </button>

      {modal === "edit" && (
        <Modal title={`Edytuj: ${name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Nazwa firmy *</label>
              <input
                type="text"
                required
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>
                Adres <span className="text-brand-chrom/60">(z kodem i miastem — z niego liczone są km)</span>
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="ul. Przykładowa 10, 30-001 Kraków"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>
                E-mail * <span className="text-brand-chrom/60">(także login)</span>
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Instagram</label>
              <input
                type="text"
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="@studio_wraps"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={inputCls}
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Specjalizacje (oddzielone przecinkami)</label>
              <input
                type="text"
                value={form.specializations}
                onChange={(e) => setForm({ ...form, specializations: e.target.value })}
                placeholder="oklejanie, PPF, ceramika, detailing"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-4">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
              >
                {loading ? "Zapisuję..." : "Zapisz"}
              </button>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          </form>
        </Modal>
      )}

      {modal === "message" && (
        <Modal title={`Wiadomość do: ${name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleMessage} className="space-y-4">
            <div>
              <label className={labelCls}>Temat</label>
              <input
                type="text"
                value={msg.subject}
                onChange={(e) => setMsg({ ...msg, subject: e.target.value })}
                required={msg.channel !== "panel"}
                maxLength={200}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Treść *</label>
              <textarea
                required
                rows={7}
                value={msg.body}
                onChange={(e) => setMsg({ ...msg, body: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="flex gap-4 flex-wrap">
              {channelOptions.map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm text-brand-chrom">
                  <input
                    type="radio"
                    name={`channel-${studio.id}`}
                    checked={msg.channel === o.value}
                    onChange={() => setMsg({ ...msg, channel: o.value })}
                    className="accent-brand-lime"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {msg.channel !== "panel" && (
              <p className="text-xs text-brand-chrom/60">
                Mail pójdzie na: {studio.email || "— brak adresu —"}
              </p>
            )}
            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-brand-lime text-brand-grafit font-bold text-sm rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
              >
                {loading ? "Wysyłam..." : "Wyślij"}
              </button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            {success && <p className="text-sm text-brand-lime">✓ {success}</p>}
          </form>
        </Modal>
      )}

      {modal === "delete" && (
        <Modal title="Usuń studio" onClose={() => setModal(null)}>
          <p className="text-sm text-brand-chrom mb-5">
            Ukryć studio <strong className="text-brand-kosc">{name}</strong>? Dane i
            zlecenia zostaną zachowane, można cofnąć.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={loading}
              className="px-5 py-2.5 bg-red-400/15 text-red-400 font-bold text-sm rounded-xl hover:bg-red-400/25 transition disabled:opacity-50"
            >
              {loading ? "Ukrywam..." : "Ukryj studio"}
            </button>
            <button
              onClick={() => setModal(null)}
              className="px-5 py-2.5 text-sm text-brand-chrom hover:text-brand-kosc transition"
            >
              Anuluj
            </button>
            {error && <p className="text-sm text-red-400">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Przycisk na zakładce „Usunięte". */
export function RestoreStudioButton({ studioId }: { studioId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    setLoading(true);
    setError("");
    const res = await setStudioDeleted(studioId, false);
    setLoading(false);
    if (!res.ok) return setError(res.error || "Nieznany błąd.");
    router.refresh();
  }

  return (
    <div className="ml-4 shrink-0 text-right">
      <button
        onClick={restore}
        disabled={loading}
        className="px-3 py-1.5 text-xs bg-brand-lime/15 text-brand-lime rounded-lg hover:bg-brand-lime/25 transition font-medium disabled:opacity-50"
      >
        {loading ? "Przywracam..." : "Przywróć"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

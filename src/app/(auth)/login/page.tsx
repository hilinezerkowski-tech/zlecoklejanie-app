"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [password, setPassword] = useState("");

  const supabase = createClient();

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setError("Nie udało się wysłać linku. Spróbuj ponownie.");
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Nieprawidłowy email lub hasło.");
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-brand-lime/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-lime" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-3">Sprawdź skrzynkę</h1>
          <p className="text-brand-chrom mb-2">
            Wysłaliśmy link logowania na
          </p>
          <p className="text-brand-lime font-medium mb-6">{email}</p>
          <p className="text-sm text-brand-chrom">
            Kliknij link w mailu, żeby się zalogować. Nie potrzebujesz hasła.
          </p>
          <button
            onClick={() => { setSent(false); setEmail(""); }}
            className="mt-8 text-sm text-brand-chrom hover:text-brand-kosc transition"
          >
            ← Użyj innego adresu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold">
            zlec<span className="text-brand-lime">oklejanie</span>
          </h1>
          <p className="text-brand-chrom mt-2 text-sm">Panel zarządzania</p>
        </div>

        {/* Formularz */}
        <div className="bg-brand-grafit-light border border-brand-border rounded-2xl p-8">
          {mode === "magic" ? (
            <form onSubmit={handleMagicLink}>
              <label className="block text-sm font-medium mb-2">
                Adres e-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jan@studio.pl"
                required
                className="w-full px-4 py-3 bg-brand-grafit border border-brand-border rounded-xl text-brand-kosc placeholder:text-brand-chrom/50 focus:outline-none focus:border-brand-lime transition"
              />
              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 bg-brand-lime text-brand-grafit font-bold rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
              >
                {loading ? "Wysyłanie..." : "Wyślij link logowania"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePassword}>
              <label className="block text-sm font-medium mb-2">
                Adres e-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@zlecoklejanie.pl"
                required
                className="w-full px-4 py-3 bg-brand-grafit border border-brand-border rounded-xl text-brand-kosc placeholder:text-brand-chrom/50 focus:outline-none focus:border-brand-lime transition"
              />
              <label className="block text-sm font-medium mb-2 mt-4">
                Hasło
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-3 bg-brand-grafit border border-brand-border rounded-xl text-brand-kosc placeholder:text-brand-chrom/50 focus:outline-none focus:border-brand-lime transition"
              />
              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 bg-brand-lime text-brand-grafit font-bold rounded-xl hover:bg-brand-lime/90 transition disabled:opacity-50"
              >
                {loading ? "Logowanie..." : "Zaloguj się"}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-brand-border text-center">
            <button
              onClick={() => setMode(mode === "magic" ? "password" : "magic")}
              className="text-sm text-brand-chrom hover:text-brand-kosc transition"
            >
              {mode === "magic"
                ? "Logowanie hasłem (admin)"
                : "← Logowanie bez hasła (magic-link)"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-brand-chrom/60 mt-6">
          Studia i klienci logują się magic-linkiem (bez hasła).
          <br />
          Panel admina wymaga hasła.
        </p>
      </div>
    </div>
  );
}

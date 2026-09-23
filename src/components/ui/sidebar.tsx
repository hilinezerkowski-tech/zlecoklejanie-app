"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";

interface SidebarProps {
  role: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  /** Liczniki przy pozycjach menu: href -> liczba (0 = bez plakietki). */
  badges?: Record<string, number>;
}

const menuItems: Record<string, { label: string; href: string; icon: string }[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: "📊" },
    { label: "Leady", href: "/admin/leady", icon: "📥" },
    { label: "Zlecenia", href: "/admin/zlecenia", icon: "📋" },
    { label: "Studia", href: "/admin/studia", icon: "🏢" },
    { label: "Graficy", href: "/admin/graficy", icon: "🎨" },
    { label: "Wrapperzy", href: "/admin/leady-freelancer", icon: "🚗" },
    { label: "Opinie", href: "/admin/opinie", icon: "⭐" },
    { label: "Eksport CSV", href: "/admin/eksport", icon: "📤" },
    { label: "Ustawienia", href: "/admin/ustawienia", icon: "⚙️" },
  ],
  studio: [
    { label: "Dashboard", href: "/studio", icon: "📊" },
    { label: "Zlecenia", href: "/studio/zlecenia", icon: "📋" },
    { label: "Wiadomości", href: "/studio/wiadomosci", icon: "✉️" },
    { label: "Mój profil", href: "/studio/profil", icon: "🏢" },
    { label: "Historia", href: "/studio/historia", icon: "📁" },
  ],
  client: [
    { label: "Moje zlecenia", href: "/klient", icon: "📋" },
  ],
  designer: [
    { label: "Dashboard", href: "/grafik", icon: "📊" },
    { label: "Briefy", href: "/grafik/briefy", icon: "📋" },
    { label: "Mój profil", href: "/grafik/profil", icon: "🎨" },
  ],
};

export function Sidebar({ role, name, email, badges }: SidebarProps) {
  const pathname = usePathname();
  const items = menuItems[role] || [];
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Zamknij sidebar po zmianie strony
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Blokuj scroll body kiedy sidebar jest otwarty na mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    studio: "Studio",
    client: "Klient",
    designer: "Grafik",
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-brand-grafit-light border-b border-brand-border flex items-center px-4 z-40">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 -ml-2 text-brand-kosc hover:bg-white/5 rounded-lg transition"
          aria-label="Otwórz menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="ml-3 text-lg font-extrabold">
          zlec<span className="text-brand-lime">oklejanie</span>
        </span>
        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-brand-lime/15 text-brand-lime font-medium">
          {roleLabels[role] || role}
        </span>
      </div>

      {/* Overlay (mobile) */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40 touch-none"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 w-64 h-dvh bg-brand-grafit-light border-r border-brand-border flex flex-col z-50
          transition-transform duration-200 ease-in-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Logo + close button */}
        <div className="p-6 border-b border-brand-border flex items-start justify-between">
          <div>
            <Link href="/" className="text-xl font-extrabold">
              zlec<span className="text-brand-lime">oklejanie</span>
            </Link>
            <div className="mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-lime/15 text-brand-lime font-medium">
                {roleLabels[role] || role}
              </span>
            </div>
          </div>
          {/* Close button — only on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1 text-brand-chrom hover:text-brand-kosc transition"
            aria-label="Zamknij menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto overscroll-contain">
          {items.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== `/${role === "client" ? "klient" : role}` && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
                  isActive
                    ? "bg-brand-lime/10 text-brand-lime font-medium"
                    : "text-brand-chrom hover:text-brand-kosc hover:bg-white/5"
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
                {(badges?.[item.href] ?? 0) > 0 && (
                  <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-brand-lime text-brand-grafit font-bold">
                    {badges![item.href]}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-brand-border">
          <div className="mb-3">
            <p className="text-sm font-medium truncate">{name}</p>
            <p className="text-xs text-brand-chrom truncate">{email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-sm text-brand-chrom hover:text-red-400 hover:bg-red-400/10 rounded-lg transition text-left"
          >
            Wyloguj się
          </button>
        </div>
      </aside>
    </>
  );
}

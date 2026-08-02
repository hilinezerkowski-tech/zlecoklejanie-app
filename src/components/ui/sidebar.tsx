"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  role: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

const menuItems: Record<string, { label: string; href: string; icon: string }[]> = {
  admin: [
    { label: "Dashboard", href: "/admin", icon: "📊" },
    { label: "Zlecenia", href: "/admin/zlecenia", icon: "📋" },
    { label: "Studia", href: "/admin/studia", icon: "🏢" },
    { label: "Ustawienia", href: "/admin/ustawienia", icon: "⚙️" },
  ],
  studio: [
    { label: "Dashboard", href: "/studio", icon: "📊" },
    { label: "Zlecenia", href: "/studio/zlecenia", icon: "📋" },
    { label: "Mój profil", href: "/studio/profil", icon: "🏢" },
    { label: "Historia", href: "/studio/historia", icon: "📁" },
  ],
  client: [
    { label: "Moje zlecenia", href: "/klient", icon: "📋" },
  ],
};

export function Sidebar({ role, name, email }: SidebarProps) {
  const pathname = usePathname();
  const items = menuItems[role] || [];
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    studio: "Studio",
    client: "Klient",
  };

  return (
    <aside className="fixed left-0 top-0 w-64 h-screen bg-brand-grafit-light border-r border-brand-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-brand-border">
        <Link href="/" className="text-xl font-extrabold">
          zlec<span className="text-brand-lime">oklejanie</span>
        </Link>
        <div className="mt-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-brand-lime/15 text-brand-lime font-medium">
            {roleLabels[role] || role}
          </span>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-4 space-y-1">
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
  );
}

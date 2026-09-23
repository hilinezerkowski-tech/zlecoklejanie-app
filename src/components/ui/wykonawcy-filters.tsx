"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState, useEffect } from "react";

type Props = {
  miasta: string[];
  uslugi: string[];
  // Gdy true, filtr miasta jest ukryty (jesteśmy na stronie miasta)
  hideCity?: boolean;
};

export function WykonawcyFilters({ miasta, uslugi, hideCity }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const push = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(Array.from(sp.entries()));
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, sp]
  );

  // Debounce dla pola szukania
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) push({ q });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sel =
    "rounded-xl border border-brand-border bg-brand-grafit px-3 py-2.5 text-sm text-brand-kosc focus:border-brand-lime focus:outline-none";

  return (
    <div className="flex flex-wrap gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Szukaj nazwy lub usługi…"
        className={`${sel} min-w-[200px] flex-1`}
      />

      {!hideCity && (
        <select
          value={sp.get("miasto") ?? ""}
          onChange={(e) => push({ miasto: e.target.value })}
          className={sel}
        >
          <option value="">Całe miasto</option>
          {miasta.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      <select
        value={sp.get("usluga") ?? ""}
        onChange={(e) => push({ usluga: e.target.value })}
        className={sel}
      >
        <option value="">Każda usługa</option>
        {uslugi.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      <select
        value={sp.get("typ") ?? ""}
        onChange={(e) => push({ typ: e.target.value })}
        className={sel}
      >
        <option value="">Studio i wrapper</option>
        <option value="studio">Tylko studia</option>
        <option value="freelancer">Wrapperzy mobilni</option>
      </select>
    </div>
  );
}

// Powody odmowy zlecenia przez studio (link tokenowy /o/<token>) — decline_reason w order_assignments.

export const POWODY_ODMOWY = [
  { kod: "brak_terminu", label: "Brak terminu" },
  { kod: "poza_zakresem", label: "Poza moim zakresem" },
  { kod: "za_daleko", label: "Za daleko" },
  { kod: "za_malo_informacji", label: "Za mało informacji w zleceniu" },
  { kod: "inne", label: "Inne" },
] as const;

export type KodOdmowy = (typeof POWODY_ODMOWY)[number]["kod"];

export const czyKodOdmowy = (v: unknown): v is KodOdmowy => POWODY_ODMOWY.some((p) => p.kod === v);

export function labelOdmowy(kod: string | null | undefined): string {
  if (!kod) return "bez podania powodu";
  const [k, ...reszta] = kod.split(": ");
  const p = POWODY_ODMOWY.find((x) => x.kod === k);
  return (p ? p.label : k) + (reszta.length ? ` (${reszta.join(": ")})` : "");
}

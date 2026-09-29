import { PublicAnalytics } from "@/components/consent/public-analytics";

// Strony publiczne (katalog / profile): baner zgody i analityka WYŁĄCZNIE po zgodzie.
// Paneli (/admin, /studio, /klient, /grafik) ten layout nie obejmuje — tam analityki nie ma.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PublicAnalytics />
    </>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZlecOklejanie.pl",
  description: "Marketplace oklejania aut, folii PPF i brandingu flot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

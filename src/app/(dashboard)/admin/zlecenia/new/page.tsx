import Link from "next/link";
import { NewOrderForm } from "./new-order-form";

export const metadata = { title: "Nowe zlecenie — Admin" };

export default function NewOrderPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/zlecenia"
          className="text-sm text-brand-chrom hover:text-brand-text transition-colors"
        >
          ← Zlecenia
        </Link>
        <span className="text-brand-border">/</span>
        <h1 className="text-lg font-semibold text-brand-text">Nowe zlecenie</h1>
      </div>
      <p className="text-sm text-brand-chrom mb-6">
        Utwórz zlecenie zgłoszone telefonicznie. Klient dostanie dostęp do portalu po pierwszym
        logowaniu magic-link.
      </p>
      <NewOrderForm />
    </div>
  );
}

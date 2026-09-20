"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markStudioMessagesRead } from "@/app/actions/studio-inbox";

/** Otwarcie skrzynki = przeczytane. Renderowany tylko, gdy są nieprzeczytane. */
export function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    // refresh czyści licznik w menu; nowe wiadomości zostają podświetlone do wyjścia ze strony
    markStudioMessagesRead().then(() => router.refresh());
  }, [router]);
  return null;
}

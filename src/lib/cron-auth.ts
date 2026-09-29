import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/** Sprawdza `Authorization: Bearer <CRON_SECRET>`. Brak sekretu w env = endpointy /api/cron/* zamknięte. */
export function autoryzowanyCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

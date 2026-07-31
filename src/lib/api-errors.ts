import { NextResponse } from "next/server";
import { staleClientHint } from "@/lib/domain/prisma-drift";

/**
 * Last-resort handler for an error a route did not expect: answers with JSON the
 * UI can show instead of letting it become a bodiless 500. A stale generated
 * Prisma client (schema changed, process not restarted) gets its own message —
 * that failure mode is otherwise invisible outside the server log.
 */
export function serverError(err: unknown) {
  console.error(err);
  const hint = staleClientHint(err);
  return NextResponse.json({ error: hint ?? "Внутренняя ошибка сервера" }, { status: 500 });
}

import { NextResponse } from "next/server";
import { userOr401 } from "@/lib/api";
import { listArchiveRows } from "@/server/users";

/** Cabinet list of archives with track counts and sizes (loaded on demand). */
export async function GET() {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ archives: await listArchiveRows(auth.userId) });
}

import { NextResponse } from "next/server";
import { requireUserId } from "@/auth";

/** Resolve the current user id or return a 401 response to short-circuit a route. */
export async function userOr401(): Promise<
  { userId: string } | { response: NextResponse }
> {
  try {
    const userId = await requireUserId();
    return { userId };
  } catch {
    return { response: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound() {
  return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
}

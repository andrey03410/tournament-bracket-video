import { NextResponse } from "next/server";
import { userOr401 } from "@/lib/api";
import { usageSummary } from "@/server/users";

export async function GET() {
  const auth = await userOr401();
  if ("response" in auth) return auth.response;
  const summary = await usageSummary(auth.userId);
  return NextResponse.json({ email: auth.user.email, ...summary });
}

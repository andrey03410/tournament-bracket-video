import { NextResponse } from "next/server";
import { permissionOr403 } from "@/lib/api";
import { listUsers } from "@/server/users";

export async function GET() {
  const auth = await permissionOr403("admin:users");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ users: await listUsers() });
}

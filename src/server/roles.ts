import "server-only";
import { prisma } from "@/lib/db";

/** Emails auto-elevated to admin on login/registration (comma-separated env). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Bootstrap: if the email is listed in ADMIN_EMAILS but the stored role is
 * lower, persist the elevation. Survives DB recreation.
 */
export async function ensureAdminRole(user: {
  id: string;
  email: string;
  role: string;
}): Promise<string> {
  if (user.role !== "admin" && adminEmails().includes(user.email.toLowerCase())) {
    await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
    return "admin";
  }
  return user.role;
}

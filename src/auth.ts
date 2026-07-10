import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

import { ensureAdminRole } from "@/server/roles";

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = credsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        await ensureAdminRole(user);
        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
});

export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Resolve the current user with a FRESH role from the DB (the JWT only
 * carries the id). A role change by an admin therefore applies on the very
 * next request, without re-login. Throws if unauthenticated.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) throw new Error("UNAUTHENTICATED");
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error("UNAUTHENTICATED"); // deleted while session alive
  return user;
}

/** Resolve the current user id, or throw if unauthenticated. */
export async function requireUserId(): Promise<string> {
  return (await requireUser()).id;
}

/** Like requireUser, but returns null instead of throwing (for pages). */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    return await requireUser();
  } catch {
    return null;
  }
}

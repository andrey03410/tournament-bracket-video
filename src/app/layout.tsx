import "./globals.css";
import type { Metadata } from "next";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "OST Top Builder",
  description: "Турнирные топы саундтреков и рендер видео",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="ru">
      <body>
        <div className="topbar">
          <a className="brand" href="/">
            🎵 OST Top Builder
          </a>
          {session?.user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <div className="row">
                <span className="muted">{session.user.email}</span>
                <button className="btn ghost" type="submit">
                  Выйти
                </button>
              </div>
            </form>
          ) : null}
        </div>
        {children}
      </body>
    </html>
  );
}

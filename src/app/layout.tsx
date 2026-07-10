import "./globals.css";
import type { Metadata } from "next";
import { currentUser, signOut } from "@/auth";
import { can } from "@/lib/domain/permissions";

export const metadata: Metadata = {
  title: "OST Top Builder",
  description: "Турнирные топы саундтреков и рендер видео",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  return (
    <html lang="ru">
      <body>
        <div className="topbar">
          <div className="row" style={{ gap: 18 }}>
            <a className="brand" href="/">
              🎵 OST Top Builder
            </a>
            {user ? (
              <nav className="row" style={{ gap: 14 }}>
                <a href="/tournaments">Мои топы</a>
                <a href="/account">Личный кабинет</a>
                {can(user.role, "admin:users") ? <a href="/admin">Админка</a> : null}
              </nav>
            ) : null}
          </div>
          {user ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <div className="row">
                <span className="muted">{user.email}</span>
                <button className="btn ghost" type="submit">
                  Выйти
                </button>
              </div>
            </form>
          ) : (
            <a className="btn ghost" href="/login">
              Войти
            </a>
          )}
        </div>
        {children}
      </body>
    </html>
  );
}

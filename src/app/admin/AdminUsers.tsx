"use client";

import { useCallback, useEffect, useState } from "react";

interface UserRow {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  tournamentCount: number;
  diskBytes: number;
}

const MB = 1024 * 1024;
function fmtBytes(n: number): string {
  if (n >= 1024 * MB) return `${(n / (1024 * MB)).toFixed(1)} ГБ`;
  if (n >= MB) return `${(n / MB).toFixed(1)} МБ`;
  if (n >= 1024) return `${Math.round(n / 1024)} КБ`;
  return `${Math.round(n)} Б`;
}

const ROLE_OPTIONS = [
  { value: "user", label: "Пользователь" },
  { value: "admin", label: "Администратор" },
];

export function AdminUsers({ selfId }: { selfId: string }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "Не удалось загрузить пользователей");
      return;
    }
    setUsers(d.users);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function changeRole(u: UserRow, role: string) {
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Не удалось сменить роль");
      await reload();
    } catch (e) {
      setError((e as Error).message);
      await reload(); // roll the select back to the persisted value
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(u: UserRow) {
    if (
      !confirm(
        `Удалить пользователя ${u.email}? Все его турниры, медиа и рендеры будут стёрты с сервера.`,
      )
    )
      return;
    setBusyId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Не удалось удалить пользователя");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!users) {
    return <div className="panel">{error ? <div className="error">{error}</div> : "Загрузка…"}</div>;
  }

  return (
    <div className="panel">
      {error ? <div className="error">{error}</div> : null}
      {users.map((u) => (
        <div className="list-item" key={u.id}>
          <div>
            <span style={{ fontWeight: 600 }}>{u.email}</span>
            {u.id === selfId ? <span className="tag" style={{ marginLeft: 8 }}>это вы</span> : null}
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {u.tournamentCount} турниров · {fmtBytes(u.diskBytes)} на диске ·
              с {new Date(u.createdAt).toLocaleDateString("ru-RU")}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <select
              value={u.role}
              disabled={u.id === selfId || busyId === u.id}
              onChange={(e) => changeRole(u, e.target.value)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
              {!ROLE_OPTIONS.some((r) => r.value === u.role) ? (
                <option value={u.role}>{u.role}</option>
              ) : null}
            </select>
            <button
              className="btn ghost"
              disabled={u.id === selfId || busyId === u.id}
              onClick={() => removeUser(u)}
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

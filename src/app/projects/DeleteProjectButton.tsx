"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteProjectButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm(`Удалить проект «${title}»? Рендеры будут стёрты с сервера.`)) return;
    setBusy(true);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <button className="btn ghost" disabled={busy} onClick={onDelete}>
      Удалить
    </button>
  );
}

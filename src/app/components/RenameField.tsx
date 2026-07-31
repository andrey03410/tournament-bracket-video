"use client";

import { useEffect, useRef, useState } from "react";

// Inline rename with an answer. Before phase 17 the pool's name field saved on
// blur and threw the response away: a failed rename looked exactly like a
// successful one, and nothing hinted the label was editable at all.

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export function RenameField({
  value,
  onSave,
  placeholder = "Название…",
  title = "Переименовать",
}: {
  value: string | null;
  /** Persist the new label; throwing keeps the old value on screen. */
  onSave: (next: string | null) => Promise<void>;
  placeholder?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const savedRef = useRef(value ?? "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Escape blurs the field, and blur saves — this flag is how the cancel wins.
  const cancelRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A reload (or a rename from elsewhere) wins over an untouched draft.
  useEffect(() => {
    savedRef.current = value ?? "";
    setDraft((prev) => (prev === savedRef.current ? prev : value ?? ""));
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function save() {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(savedRef.current);
      setStatus({ kind: "idle" });
      return;
    }
    const next = draft.trim();
    if (next === savedRef.current.trim()) {
      setStatus({ kind: "idle" });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      await onSave(next || null);
      savedRef.current = next;
      setDraft(next);
      setStatus({ kind: "saved" });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus({ kind: "idle" }), 1500);
    } catch (e) {
      setDraft(savedRef.current); // an unsaved name must not linger as if it stuck
      setStatus({ kind: "error", message: (e as Error).message || "Не удалось переименовать" });
    }
  }

  return (
    <span className="rename-field">
      <input
        ref={inputRef}
        className="rename-input"
        value={draft}
        placeholder={placeholder}
        title={title}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setDraft(e.target.value);
          if (status.kind === "error" || status.kind === "saved") setStatus({ kind: "idle" });
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            inputRef.current?.blur(); // blur triggers the save once
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelRef.current = true;
            setDraft(savedRef.current);
            setStatus({ kind: "idle" });
            inputRef.current?.blur();
          }
        }}
        onBlur={() => void save()}
      />
      <span className="rename-status" aria-live="polite">
        {status.kind === "saving" ? (
          <span className="muted">…</span>
        ) : status.kind === "saved" ? (
          <span className="rename-ok">✓ сохранено</span>
        ) : status.kind === "error" ? (
          <span className="rename-err" title={status.message}>
            {status.message}
          </span>
        ) : (
          <span className="rename-pencil" aria-hidden>
            ✎
          </span>
        )}
      </span>
    </span>
  );
}

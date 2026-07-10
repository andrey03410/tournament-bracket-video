"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { loginAction, registerAction, type AuthState } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending} style={{ marginTop: 18 }}>
      {pending ? "…" : label}
    </button>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(
    params.get("mode") === "register" ? "register" : "login",
  );
  const action = mode === "login" ? loginAction : registerAction;
  const [state, formAction] = useFormState<AuthState, FormData>(action, undefined);

  return (
    <div className="container" style={{ maxWidth: 420 }}>
      <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>
      <div className="panel">
        <form action={formAction}>
          <label>Email</label>
          <input name="email" type="email" autoComplete="email" required />
          <label>Пароль</label>
          <input
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
          {state?.error ? <div className="error">{state.error}</div> : null}
          <SubmitButton label={mode === "login" ? "Войти" : "Создать аккаунт"} />
        </form>
      </div>
      <p className="muted">
        {mode === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Зарегистрироваться" : "Войти"}
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary for static prerendering.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

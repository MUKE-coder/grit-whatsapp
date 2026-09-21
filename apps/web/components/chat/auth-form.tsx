"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { chatKeys } from "@/hooks/use-chat";
import { getApiErrorMessage } from "@/lib/api-core";
import { login, register } from "@/lib/chat-api";

/** Sign in and sign up share one card; mode picks the fields and the call. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "");
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await register({
          first_name: field("first_name"),
          last_name: field("last_name"),
          email: field("email"),
          password: field("password"),
        });
      } else {
        await login(field("email"), field("password"));
      }
      await qc.invalidateQueries({ queryKey: chatKeys.me });
      router.replace("/chat");
    } catch (err) {
      setError(getApiErrorMessage(err, mode === "login" ? "Could not sign you in." : "Could not create your account."));
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-accent";

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-tertiary px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-bg-elevated p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <MessageCircle className="h-7 w-7 text-success" aria-hidden />
          <h1 className="font-semibold text-foreground text-xl">
            {mode === "login" ? "Sign in to chat" : "Create your account"}
          </h1>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "register" && (
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-text-secondary">First name</span>
                <input name="first_name" required autoComplete="given-name" className={input} />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                <span className="text-text-secondary">Last name</span>
                <input name="last_name" required autoComplete="family-name" className={input} />
              </label>
            </div>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Email</span>
            <input name="email" type="email" required autoComplete="email" className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={input}
            />
          </label>
          {error && (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-text-secondary">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link href="/register" className="text-accent hover:underline">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

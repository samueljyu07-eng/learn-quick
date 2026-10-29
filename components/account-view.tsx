"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useAccount } from "@/components/account-provider";
import { SiteHeader } from "@/components/site-header";
import { supabaseBrowser } from "@/lib/supabase/browser";

const fieldClass =
  "mt-1.5 w-full rounded-lg border border-line bg-card px-3 py-2 text-base text-ink placeholder:text-muted/80";

export function AccountView() {
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    await submit("sign-in");
  }

  async function createAccount() {
    await submit("sign-up");
  }

  async function submit(kind: "sign-in" | "sign-up") {
    const client = supabaseBrowser();
    if (!client) return;
    setBusy(true);
    setError("");
    setMessage("");
    const trimmed = email.trim();
    if (!trimmed.includes("@") || password.length < 8) {
      setError("Use an email address and a password of at least 8 characters.");
      setBusy(false);
      return;
    }
    const result =
      kind === "sign-in"
        ? await client.auth.signInWithPassword({ email: trimmed, password })
        : await client.auth.signUp({ email: trimmed, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    if (kind === "sign-up" && !result.data.session) {
      setMessage("Check your email to confirm the account, then sign in.");
      return;
    }
    setPassword("");
    await account.refresh();
  }

  async function signOut() {
    const client = supabaseBrowser();
    if (!client) return;
    setBusy(true);
    await client.auth.signOut();
    setBusy(false);
    await account.refresh();
  }

  return (
    <div>
      <SiteHeader current="account" />
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted">Account</p>
        <h1 className="mt-1 font-serif text-3xl tracking-tight text-ink sm:text-4xl">Sign in</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          You can study without an account. Points, hardcore locks, and My definitions are kept on the
          account after you sign in.
        </p>
      </header>

      {!account.ready ? (
        <p className="text-muted">Loading your account…</p>
      ) : !account.configured ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Supabase is not connected yet</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink">
            <li>Create a Supabase project and turn on email sign-in.</li>
            <li>Paste the project URL and the anon key into `.env.local`.</li>
            <li>Paste the service role key there too. It stays on the server and is what saves locks and points.</li>
            <li>Run `supabase/schema.sql` in the Supabase SQL editor.</li>
            <li>Restart the app.</li>
          </ol>
        </section>
      ) : account.email ? (
        <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
          <h2 className="font-serif text-2xl text-ink">Signed in</h2>
          <p className="mt-2 text-base text-ink">{account.email}</p>
          {!account.trusted ? (
            <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm leading-relaxed text-warn">
              Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` so hardcore locks and points can move onto this
              account. My definitions can sync with the anon key.
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/progress" className="rounded-xl bg-accent px-5 py-3 text-center font-semibold text-white">
              Your points
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
              className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink disabled:opacity-60"
            >
              Sign out
            </button>
          </div>
        </section>
      ) : (
        <form onSubmit={(event) => void signIn(event)} className="rounded-2xl border border-line bg-card p-4 sm:p-6" noValidate>
          <label className="block text-sm font-semibold text-ink">
            Email
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="mt-4 block text-sm font-semibold text-ink">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
          {error ? <p className="mt-4 text-sm leading-relaxed text-danger">{error}</p> : null}
          {message ? <p className="mt-4 text-sm leading-relaxed text-ink">{message}</p> : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-60"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => void createAccount()}
              disabled={busy}
              className="rounded-xl border border-line bg-card px-5 py-3 font-semibold text-ink disabled:opacity-60"
            >
              Create account
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

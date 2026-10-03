"use client";

import { Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setError(json.error ?? "Couldn't sign in.");
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    }
    setBusy(false);
  };

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center px-6">
      <form onSubmit={submit} className="rise w-full text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-accent-soft text-accent">
          <Lock size={28} />
        </div>
        <h1 className="font-display text-4xl font-semibold">My Day</h1>
        <p className="mb-8 mt-2 text-ink-2">Enter your passcode to open your diary.</p>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          aria-label="Passcode"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="h-14 w-full rounded-2xl border border-line bg-surface px-5 text-center text-lg"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm text-bad">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!passcode || busy}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-semibold text-on-accent transition active:scale-[0.98] disabled:opacity-60"
        >
          {busy && <Loader2 size={20} className="animate-spin" />}
          Open
        </button>
      </form>
    </main>
  );
}

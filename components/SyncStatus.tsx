"use client";
import { useState } from "react";
import {
  useWorkspace,
  unlockOffline,
  resolveChange,
  syncWorkspace,
} from "@/lib/workspace-client";
import { Card } from "./ui";
export function SyncStatus() {
  const s = useWorkspace();
  const [pass, setPass] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setPass("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!s.enabled) return null;
  if (!s.unlocked)
    return (
      <Card className="m-4">
        <p className="text-sm font-semibold">Unlock device storage</p>
        <p className="mt-1 text-sm text-ink-2">
          Your offline records stay encrypted between launches. Unlock to save
          and sync this device.
        </p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => unlockOffline(pass));
          }}
        >
          <input
            aria-label="Device passphrase"
            type="password"
            autoComplete="off"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3"
          />
          <button disabled={busy || !pass} className="primary-button">
            Unlock
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {error}
          </p>
        )}
      </Card>
    );
  const conflict = s.queue.find((q) => q.error);
  if (conflict)
    return (
      <Card className="m-4">
        <h2 className="font-semibold">A change needs your review</h2>
        <p className="mt-2 text-sm text-ink-2">{conflict.error}</p>
        <button
          onClick={() => setShow(!show)}
          className="secondary-button mt-3"
        >
          {show ? "Hide" : "Compare"} changes
        </button>
        {show && <ConflictComparison local={conflict.mutation.key} />}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy}
            className="primary-button"
            onClick={() => void run(() => resolveChange(true))}
          >
            Keep device version
          </button>
          <button
            disabled={busy}
            className="secondary-button"
            onClick={() => void run(() => resolveChange(false))}
          >
            Use server version
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Your choice applies to the queued edits of this record. Other records
          are kept.
        </p>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
      </Card>
    );
  return (
    <div
      role="status"
      className="mx-4 my-2 flex items-center justify-between gap-2 text-xs text-ink-2"
    >
      <span>
        {s.queue.length
          ? `${s.queue.length} change${s.queue.length === 1 ? "" : "s"} saved on this device · ${s.syncing ? "syncing…" : "waiting to sync"}`
          : "All changes synced"}
      </span>
      {s.queue.length > 0 && (
        <button
          className="secondary-button text-xs"
          onClick={() => void syncWorkspace()}
        >
          Retry sync
        </button>
      )}
    </div>
  );
}
function ConflictComparison({ local }: { local: string }) {
  const s = useWorkspace(),
    [remote, setRemote] = useState<unknown>(),
    [error, setError] = useState("");
  return (
    <div className="mt-3 space-y-2 text-xs">
      <p className="font-semibold">Device version</p>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3">
        {JSON.stringify(
          s.data?.records.find((r) => r.key === local)?.data,
          null,
          2,
        )}
      </pre>
      <button
        className="secondary-button"
        onClick={async () => {
          try {
            const r = await fetch("/api/workspace", { cache: "no-store" });
            if (!r.ok) throw new Error("Reconnect and sign in to compare.");
            const d = await r.json();
            setRemote(
              d.records.find((x: { key: string }) => x.key === local)?.data ??
                "No version on server",
            );
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Load server version
      </button>
      {remote !== undefined && (
        <>
          <p className="font-semibold">Server version</p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-3">
            {JSON.stringify(remote, null, 2)}
          </pre>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

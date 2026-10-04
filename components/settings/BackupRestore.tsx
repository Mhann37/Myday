"use client";

import { Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { backupSchema, type Backup, type RestoreResult } from "@/lib/backup";
import { goToLogin, refreshEntries } from "@/lib/client";
import { refreshHabits } from "@/lib/habit-client";

export function BackupRestore() {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const restore = async () => {
    if (!backup || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      if (response.status === 401) {
        goToLogin();
        return;
      }
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Couldn't restore this backup.");
      const counts = result as RestoreResult;
      setNotice(
        `Restored ${counts.entriesAdded} check-ins, ${counts.habitsAdded} habits, and ${counts.logsAdded} quick logs. Existing records were kept.`,
      );
      setBackup(null);
      await Promise.all([refreshEntries(), refreshHabits()]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't restore this backup.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-line pt-3">
      <label className="secondary-button cursor-pointer text-sm">
        <Upload size={16} /> Restore a JSON backup
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          className="sr-only"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setError("");
            setNotice("");
            setBackup(null);
            try {
              if (file.size > 8_000_000)
                throw new Error("Choose a backup smaller than 8 MB.");
              const parsed = backupSchema.safeParse(
                JSON.parse(await file.text()),
              );
              if (!parsed.success)
                throw new Error("Choose a valid My Day JSON backup.");
              setBackup(parsed.data);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Couldn't read this file.",
              );
            }
          }}
        />
      </label>
      {backup && (
        <div className="mt-3 rounded-xl bg-surface-2 p-4">
          <p className="text-sm font-semibold">Ready to restore</p>
          <p className="mt-1 text-sm text-ink-2">
            {backup.entries.length} check-ins, {backup.habits.length} habits,
            and {backup.logs.length} quick logs. Only missing records will be
            added. Your current data won’t be overwritten.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              className="primary-button text-sm"
              onClick={() => void restore()}
            >
              {busy && <Loader2 size={15} className="animate-spin" />}Restore
              missing records
            </button>
            <button
              disabled={busy}
              type="button"
              className="secondary-button text-sm"
              onClick={() => setBackup(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-good">
          {notice}
        </p>
      )}
    </div>
  );
}

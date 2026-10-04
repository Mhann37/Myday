"use client";

import { Download, FileJson, LogOut, Smartphone, Table2 } from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { buildDays } from "@/lib/analytics";
import { goToLogin, useEntries } from "@/lib/client";
import { formatDayMonth } from "@/lib/dates";
import { Card } from "../ui";
import { useHabits } from "@/lib/habit-client";
import { Sprout } from "lucide-react";
import { ConnectedSources } from "./ConnectedSources";
import { MeasurementImport } from "./MeasurementImport";
import { Personalisation } from "./Personalisation";
import { ReminderSettings } from "./ReminderSettings";
import { BackupRestore } from "./BackupRestore";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const subscribeDisplayMode = (cb: () => void) => {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches;

function Row({
  icon,
  title,
  sub,
  href,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  href?: string;
  onClick?: () => void;
}) {
  const cls =
    "flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left active:bg-surface-2";
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{sub}</span>
      </span>
    </>
  );
  return href ? (
    <a href={href} download className={cls}>
      {body}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export function Settings() {
  const { entries } = useEntries();
  const { data: habitData } = useHabits();
  const [logoutError, setLogoutError] = useState("");
  const standalone = useSyncExternalStore(
    subscribeDisplayMode,
    isStandalone,
    () => true,
  );
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const days = entries ? buildDays(entries) : [];
  const logout = async () => {
    try {
      const deviceId = localStorage.getItem("myday-reminder-device");
      if (deviceId) {
        const disconnected = await fetch("/api/reminders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: deviceId }),
        });
        if (!disconnected.ok) throw new Error("Could not disconnect reminders");
        const registration = await navigator.serviceWorker?.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe().catch(() => false);
      }
      const response = await fetch("/api/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      goToLogin();
    } catch {
      setLogoutError("Couldn't sign out. Check your connection and try again.");
    }
  };

  return (
    <div className="space-y-4 px-4">
      {!standalone && (
        <Card className="rise">
          <h2 className="font-display mb-2 text-xl font-semibold">
            Install on your phone
          </h2>
          {installEvent ? (
            <>
              <p className="mb-3 text-ink-2">
                Add My Day to your home screen so it opens like an app.
              </p>
              <button
                type="button"
                onClick={async () => {
                  await installEvent.prompt();
                  setInstallEvent(null);
                }}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-on-accent active:scale-[0.98]"
              >
                <Smartphone size={18} /> Install app
              </button>
            </>
          ) : (
            <>
              <ol className="list-decimal space-y-1.5 pl-5 text-ink-2">
                <li>Open this site in Chrome on your Android phone.</li>
                <li>
                  Tap the <b>⋮</b> menu at the top right.
                </li>
                <li>
                  Tap <b>Install app</b> (or <b>Add to Home screen</b>).
                </li>
                <li>
                  Tap <b>Install</b>. The My Day icon appears on your home
                  screen.
                </li>
              </ol>
              <p className="mt-3 text-sm text-ink-2">
                On iPhone: open in Safari, tap <b>Share</b>, then{" "}
                <b>Add to Home Screen</b>.
              </p>
            </>
          )}
        </Card>
      )}

      <Personalisation />
      <ReminderSettings />
      <MeasurementImport />
      <ConnectedSources />
      <Card className="rise">
        <h2 className="font-display mb-1 text-xl font-semibold">Your data</h2>
        <p className="mb-2 text-sm text-ink-2">
          {entries
            ? entries.length === 0
              ? "No check-ins yet."
              : `${entries.length} check-ins across ${days.length} days, since ${formatDayMonth(days[0].date)}.`
            : "Loading…"}
        </p>
        <div className="divide-y divide-line">
          <Row
            icon={<Sprout size={20} />}
            title="Habit logs (CSV)"
            sub={`${habitData?.habits.length ?? "—"} habits. Quick logs with dates, values, and current targets.`}
            href="/api/export?format=habits"
          />
          <Row
            icon={<Table2 size={20} />}
            title="Daily summary (CSV)"
            sub="One row per day. Best for spreadsheets and analysis."
            href="/api/export?format=daily"
          />
          <Row
            icon={<Download size={20} />}
            title="All check-ins (CSV)"
            sub="Every answer from every check-in."
            href="/api/export?format=raw"
          />
          <Row
            icon={<FileJson size={20} />}
            title="Full backup (JSON)"
            sub="Your diary, habit definitions, and every quick log."
            href="/api/export?format=json"
          />
        </div>
        <BackupRestore />
      </Card>

      <Card className="rise">
        <h2 className="font-display mb-1 text-xl font-semibold">Account</h2>
        <Row
          icon={<LogOut size={20} />}
          title="Sign out"
          sub="You'll need your passcode to get back in."
          onClick={logout}
        />
        {logoutError && (
          <p role="alert" className="mt-2 text-sm text-bad">
            {logoutError}
          </p>
        )}
      </Card>

      <p className="pb-2 text-center text-xs text-muted">
        My Day · private diary · data stored in your own database
      </p>
    </div>
  );
}

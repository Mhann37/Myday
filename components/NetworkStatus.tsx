"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
const subscribe = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
export function NetworkStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="m-4 flex items-start gap-2 rounded-xl border border-line bg-surface p-3 text-sm text-ink-2"
    >
      <WifiOff size={17} className="mt-0.5 shrink-0" />
      <span>
        You’re offline. With device storage enabled and unlocked, saves stay on this device until you reconnect.
      </span>
    </div>
  );
}

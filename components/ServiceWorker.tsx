"use client";

import { useEffect } from "react";

// Cache only the static offline interface; encrypted records live in IndexedDB.
// The worker also displays optional push reminders.
export function ServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}

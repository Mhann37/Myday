import { createECDH, createHash, randomUUID } from "node:crypto";
import webpush from "web-push";
import { getStore } from "./store";
import {
  dueReminders,
  reminderOutstanding,
  type ReminderSettings,
} from "./reminders";
import { ConflictError } from "./workspace";
// Stable VAPID identity. Explicit keys can override this derived key for rotation.
export function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  if (!process.env.APP_PASSCODE) throw new Error("Passcode unavailable");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(
    createHash("sha256")
      .update(
        `myday-vapid-v1|${process.env.APP_PASSCODE}|${process.env.AUTH_SECRET ?? ""}`,
      )
      .digest(),
  );
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: ecdh.getPrivateKey().toString("base64url"),
  };
}
export async function sendPush(settings: ReminderSettings, payload: unknown) {
  const keys = vapidKeys();
  return webpush.sendNotification(
    settings.subscription,
    JSON.stringify(payload),
    {
      vapidDetails: {
        subject:
          process.env.VAPID_SUBJECT || "mailto:notifications@example.invalid",
        ...keys,
      },
      TTL: 600,
      timeout: 10000,
    },
  );
}
export async function dispatchReminders(now = new Date()) {
  const store = getStore(),
    { records, entries, habitData: data } = await store.snapshot();
  let accepted = 0,
    failed = 0;
  for (const record of records.filter((r) => r.key.startsWith("push:"))) {
    const s = record.data as ReminderSettings;
    if (!s.enabled) continue;
    const candidates = dueReminders(s, now, entries, data);
    for (const r of candidates) {
      const id = createHash("sha256")
          .update(`${s.id}:${r.id}:${r.calendarDate}`)
          .digest("hex"),
        key = `delivery:${id}`;
      const existing = (await store.listRecords()).find((x) => x.key === key);
      const previous = existing?.data as
        { state?: string; at?: string; attempts?: number } | undefined;
      if (previous?.state === "accepted" || previous?.state === "displayed")
        continue;
      if (
        previous?.at &&
        now.getTime() - new Date(previous.at).getTime() < 120000
      )
        continue;
      if ((previous?.attempts ?? 0) >= 3) continue;
      const job = {
        state: "sending",
        at: now.toISOString(),
        deviceId: s.id,
        reminder: r,
        attempts: (previous?.attempts ?? 0) + 1,
      };
      const revision = randomUUID();
      try {
        await store.writeRecord(key, job, existing?.revision ?? null, revision);
      } catch (e) {
        if (e instanceof ConflictError) continue;
        throw e;
      }
      try {
        await sendPush(s, {
          id,
          title: "My Day",
          body: r.label,
          url: r.period ? `/checkin/${r.period}` : "/habits",
          tag: id,
        });
        // A display receipt can race with dispatch completion; never replace it.
        const latest = (await store.listRecords()).find((x) => x.key === key)!;
        if ((latest.data as { state: string }).state !== "displayed")
          await store.writeRecord(
            key,
            { ...job, state: "accepted" },
            latest.revision,
            randomUUID(),
          );
        accepted++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          const latest = (await store.listRecords()).find(
            (x) => x.key === record.key,
          );
          if (latest)
            await store.writeRecord(
              record.key,
              { ...s, enabled: false },
              latest.revision,
              randomUUID(),
            );
        }
        const latest = (await store.listRecords()).find((x) => x.key === key);
        if (latest)
          await store
            .writeRecord(
              key,
              { ...job, state: "failed", status: status ?? null },
              latest.revision,
              randomUUID(),
            )
            .catch(() => {});
      }
    }
    // Snoozes are stored as one-shot jobs and retain the same completion suppression.
    const snoozes = (await store.listRecords()).filter((x) =>
      x.key.startsWith("snooze:"),
    );
    for (const job of snoozes) {
      const j = job.data as {
        deviceId: string;
        due: string;
        done: boolean;
        label: string;
        url: string;
        attempts?: number;
        reminder?: {
          period: string | null;
          habitId: string | null;
          diaryDate: string;
        };
      };
      if (
        j.deviceId !== s.id ||
        j.done ||
        (j.attempts ?? 0) >= 3 ||
        new Date(j.due) > now ||
        now.getTime() - new Date(j.due).getTime() > 600000 ||
        quietAt(s, now)
      )
        continue;
      if (
        j.reminder &&
        !reminderOutstanding(j.reminder, j.reminder.diaryDate, entries, data)
      ) {
        await store
          .writeRecord(
            job.key,
            { ...j, done: true, suppressed: true },
            job.revision,
            randomUUID(),
          )
          .catch(() => {});
        continue;
      }
      const claimed = randomUUID();
      try {
        await store.writeRecord(
          job.key,
          { ...j, done: true, attempts: (j.attempts ?? 0) + 1 },
          job.revision,
          claimed,
        );
        await sendPush(s, {
          title: "My Day",
          body: j.label,
          url: j.url,
          tag: job.key,
        });
        accepted++;
      } catch {
        failed++;
        await store
          .writeRecord(
            job.key,
            {
              ...j,
              done: false,
              due: new Date(now.getTime() + 60000).toISOString(),
              attempts: (j.attempts ?? 0) + 1,
            },
            claimed,
            randomUUID(),
          )
          .catch(() => {});
      }
    }
  }
  return { accepted, failed };
}
import { quiet, zoned } from "./reminders";
function quietAt(s: ReminderSettings, now: Date) {
  return quiet(zoned(now, s.timezone).minute, s.quietStart, s.quietEnd);
}

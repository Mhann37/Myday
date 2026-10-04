# Daily practice upgrade: release and operations

This release builds on the merged habit tracker. It implements the product improvements from the competitive assessment that fit the web application. Production acceptance still requires a real phone, a hosted database restore rehearsal, and activation of external scheduling/monitoring. A successful preview build alone does not establish those results.

## Implemented experience

- Morning/day/evening/anytime habits, pinning, ordering, completed-row collapse, 28-day achievement and measurement coverage.
- Selected quick-check-in questions, chosen outcomes and editable household labels. Full diary values survive quick saves.
- Dated goal definitions, pauses and excused days. Unknown, not done and excused remain distinct. The weekly target in effect at the displayed date supplies that week's goal; daily target checks use each day's historical definition.
- Saved adjustments: action, linked habit, outcome, baseline date range, review date, reflection and continue/simplify/change decisions. Review dates can be extended. Outcome summaries show sample counts and supporting measurements; sparse samples do not produce an improvement claim.
- Optional session timers, pause/resume and reload recovery in the same tab. Count sessions add minutes to existing values; a session keeps its original diary day across rollover. Closing the tab can remove its timer state. No operating-system background alarm is promised.
- CSV measurement imports with preview, units, per-row validation and existing-record protection. Source names are included in CSV/JSON exports.
- Revocable, habit-scoped ingestion access for an external automation/bridge. It cannot read diary records. Subsequent source readings can replace that source's earlier reading; manual corrections and diary-only measurements are preserved. Source tokens are shown once and stored as SHA-256 digests on the server.
- Version 3 JSON backups include preferences, experiments, historical goals and log status/source. Versions 1/2 still import. Push subscriptions, source credentials, encrypted device copies and unsynced changes are deliberately device-specific and are not part of a server backup.

## Offline and concurrent edits

Enable device storage in Settings using a separate passphrase of at least eight characters. PBKDF2-SHA-256 (310,000 iterations) derives an AES-GCM key from that passphrase and a random salt. The key stays in page memory. IndexedDB holds the salt and encrypted snapshot/queue/drafts; existing unencrypted diary drafts are removed when enabling the encrypted copy. This protects a locked device copy, not a running unlocked page from malicious JavaScript.

Fresh launches require the device passphrase again. The cached static offline interface supports habit completion/counters and selected quick check-ins; full Insights, habit setup and full diary editing remain online experiences. Records are saved durably on the device before being presented as queued. Sync runs when the app is open, unlocked and connected, with retry; it is not a promise of background sync after the app closes. Web Locks coordinate writes and sync across compatible tabs. A browser without Web Locks cannot enable this feature.

Every queued mutation has a stable operation ID and expected record version. Server writes compare versions atomically; receipts make retries idempotent. Clearing/deleting a value keeps its version, so stale devices cannot silently recreate it. The server snapshot reads data and versions together in one SQL statement. Conflict review retains the device version until the user chooses it or the server version. Restoring previously absent records invalidates stale versions. The legacy write APIs also obey version checks; old clients should reload.

The browser can evict local storage. Keep server backups, sync regularly, and remember the device passphrase. Losing the passphrase or device storage can lose unsynced changes. Removing the device copy requires unlock and an empty queue. Sign-out locks it; it does not discard queued records.

## Push reminders: activation

The code includes persisted subscriptions, device timezone and quiet hours, completion-aware dispatch, leases/deduplication, bounded retries, expiry handling, a 15-minute snooze, click-through and display receipts. A push service accepting a request is recorded separately from a device displaying it. OS/browser delivery is not guaranteed. On iPhone/iPad, use a supported installed Home Screen app and grant notification permission.

1. Configure a long random `CRON_SECRET` in the Vercel project, for the environment serving the live app; redeploy.
2. Configure GitHub repository variable `MYDAY_URL` to the actual production origin, without a trailing slash.
3. Configure GitHub repository secret `MYDAY_CRON_SECRET` to the same value as `CRON_SECRET`.
4. Merge the scheduler workflow onto the default branch. Manually run **Scheduled reminders** once and check its result.
5. In app Settings, connect the device, send a test, choose reminder times and enable scheduled delivery. Test the actual phone with the app closed, after a completed habit, in quiet hours, and across its daylight-saving timezone.

GitHub's five-minute scheduled workflow is best effort and may be delayed or dropped. The dispatcher considers a ten-minute window, so delayed runs can miss a reminder rather than send an old prompt. For dependable timing, run the same bearer-protected `/api/cron/reminders` endpoint at least every five minutes through a suitable managed scheduler. Vercel Hobby's daily cron limit is unsuitable for this cadence; a paid scheduler/plan may be required. No incompatible Vercel cron configuration is enabled by this release.

Explicit `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and a valid contact `VAPID_SUBJECT` are supported. Otherwise a stable VAPID identity is derived from `APP_PASSCODE` and `AUTH_SECRET`. Rotating those secrets changes the derived push identity; unsubscribe/reconnect devices afterward. Explicit VAPID keys avoid coupling the identity to passcode changes. Push endpoints are restricted to supported browser push services; private keys and subscription data are not exposed in the public workspace snapshot or backup.

The runtime lacks hosting/scheduler credentials, so no production cron secret, repository variable, or provider setting has been activated during this task. Connecting push and sending a test does not activate a scheduler.

## External health data

CSV works immediately with the documented `date,value,source` format, up to 500 daily readings. Source connections expose a `POST /api/ingest` URL and a revocable bearer key in the setup interface. Payload:

```json
{
  "readings": [
    { "habitId": "selected-habit-uuid", "date": "2026-10-04", "value": 8500 }
  ]
}
```

Use the selected habit's units; binary workouts use 0/1, sleep hours may be fractional. Send canonical daily totals from the chosen health source, avoiding double-counting overlapping device measurements. Imported readings carry the source ID. Scope the connection to only the intended habits. There is no direct browser access to Apple HealthKit, and no platform account is connected by this release. An Apple/Android automation, health export service or native companion must supply the readings. The user's actual device/source selection is still needed to finish that bridge.

## Hosted acceptance

- Export a version 3 backup before deployment. Keep a copy outside this database.
- Confirm the Vercel deployment uses the intended Neon database. Preview deployments may share production storage; use synthetic or isolated records for destructive acceptance checks.
- In a separate database, restore the backup, compare representative diary values, goals, log status, preferences and experiments, then restore again and verify no duplicates or overwritten current data.
- Confirm Neon backup/PITR retention is appropriate for the active provider plan. Provider snapshots are separate from the in-app JSON backup.
- `/api/health` checks storage reachability without exposing diary content. The **Availability check** workflow uses `MYDAY_URL`; it starts on the default branch only once that variable is configured. Check that workflow failure notifications reach the user through their existing GitHub notification settings. It is not an activated external uptime service.
- Inspect Vercel function failures and reminder dispatch outcomes. No new third-party telemetry service is connected, and no diary contents should be sent as telemetry.
- Rehearse offline launch, lock/unlock, reconnection, conflicting edits, source revocation, quick/full check-ins, exports and sign-out on the actual phone. Measure field loading/input performance; local Chromium checks do not establish phone performance or long-term habit improvement.

## Validation

Automated coverage includes the original diary/habit workflows, real PostgreSQL-compatible queries, compare-and-swap conflicts, operation replay after newer writes, deletion versions, restore versions and a consistent snapshot. Product tests cover dated goals, pauses/excused analytics, DST/quiet-hour reminders, strict CSV imports and insufficient experiment samples. Production Chromium journeys additionally cover encrypted offline launch/reload, habit+diary queue drain, conflict comparison/choice, source protection/revocation, selected questions, saved experiments and timer reload.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run test:e2e`. Tests use a separate local store and synthetic data. They do not connect a real push provider or health account.

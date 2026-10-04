# My Day: product assessment and improvement plan

Assessment date: 4 October 2026 (Australia/Sydney). Intended user: one person, primarily on a phone, tracking habits and everyday performance.

This describes the first upgrade. The subsequent [daily practice release](release-readiness.md) implements personalisation, offline durability, conflict handling, dated goals, experiments, reminders and measurement connections; that document records their limits and remaining activation.

## Product judgment

The original product was a useful personal diary with unusually careful statistics. Its weakness was the gap between recording a day and improving the next one. The home screen offered two forms; the night form had 21 tracked questions plus conditional details and reflection. There were no configurable habits, explicit goals, quick action logging, or weekly decisions. A worthwhile habit app needs the full cycle: **choose a small action → do it → record it easily → notice progress → adjust the next week**.

The upgrade makes that cycle the organising principle. It retains the household diary, private database, and existing records while adding a configurable habit tracker. Engagement should come from useful feedback and manageable commitments. A missed day should be easy to recover from, rather than a reason to abandon the app.

This is an assessment of the repository and locally exercised application. It is not a claim of observed long-term retention, clinical benefit, a live-site security audit, or a measured ranking against commercial apps.

## Findings and changes

| Area                   | Baseline finding                                                                                  | Implemented improvement                                                                                                          | How to judge it                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| First use              | Two diary forms, little guidance on building a habit                                              | Choose a starter or create a custom habit; set a small target and a concrete cue                                                 | Create a useful first habit in under a minute                                  |
| Daily friction         | Every habit measurement required opening a check-in                                               | One-tap done/undo, quick counters, exact amount editor, optimistic feedback with rollback                                        | A simple habit takes one tap; count increment takes one tap                    |
| Goals                  | Measurements existed without a plan                                                               | Done/not done or numerical targets; selected weekdays or flexible days-per-week goals                                            | Rest days and weekly goals fit real training and family schedules              |
| Diary                  | Night flow exposed 21 tracked questions                                                           | Quick night flow exposes 8 tracked questions plus an optional win; quick morning exposes 5. Full diary retains all fields        | Complete a normal quick check-in in about a minute, verify on the actual phone |
| Return loop            | Streak badge and charts offered limited next-step guidance                                        | Visible goal progress, supportive completion feedback, weekly reset, recalled win, one suggested adjustment                      | The weekly review produces one specific behaviour to try                       |
| Analysis               | Good statistical correction; diary was the sole data source                                       | Quick logs contribute measurements; custom habits join the same corrected comparison family                                      | An insight has explicit with/without samples and remains an association        |
| Data integrity         | One unanswered training question could become “no exercise”; date regex accepted impossible dates | Preserve unknown exercise status; validate real calendar dates, types, and log ranges                                            | Missing data never silently becomes zero or “no”                               |
| History                | Diary history excluded days with only habit actions                                               | Habit-only days appear, with links to the relevant habit week                                                                    | Correct a past habit or diary without creating a duplicate                     |
| Recovery               | JSON export existed without an in-app restore flow                                                | Full backup includes habits and logs; preview an additive restore; existing records survive                                      | Restore a backup twice without changing current answers                        |
| Saving                 | Draft storage was silent; network failures were mostly generic                                    | Draft restored/saved messages, visible storage failure, offline status, habit save rollback                                      | A failed save is visibly a failure; a reopened draft retains answers           |
| Device use             | Desktop used the same narrow phone layout                                                         | Desktop sidebar and two-column dashboard; phone bottom navigation; light/dark tokens                                             | No horizontal scrolling at 390px or 1440px                                     |
| Accessibility          | Several low-contrast labels and incomplete ARIA semantics                                         | Stronger text contrast, semantic labels, keyboard radio navigation, native dialogs, larger touch targets, reduced-motion support | Automated WCAG A/AA checks plus keyboard/mobile checks                         |
| Production foundations | Existing signed cookies, throttled passcode, Neon persistence                                     | Origin checks, browser security headers, generic diary errors, safe CSV text, atomic/idempotent restore, serialised local writes | Unauthenticated APIs reject access; bad input and cross-origin mutations fail  |

## How the data works

- A habit's target measures progress. A linked habit can read water, steps, time outside, sleep, movement, lifting, or quality time from existing check-ins. A custom habit records its own actions.
- An explicit quick log takes precedence over the diary for that habit/day. Clearing it restores the diary reading. It never overwrites the diary. If multiple habits share a measurement source, the latest quick log supplies that source to aggregate analytics; individual goals retain their own logs.
- Zero or “not done” is an explicit answer. An unlogged habit remains unknown in comparisons. To learn from completed versus skipped days, explicitly record skipped days using the day editor.
- A week starts on Monday. New habits are not expected before their creation date. An onboarding week has fewer eligible days. Daily streaks ignore scheduled rest days; weekly streaks count goals achieved, and allow the current week to be pending.
- History and Insights can include habit-only days, but those days do not fabricate check-ins, mood, sleep, or a day score. Day scores reflect available self-reported mood, energy, and inverted stress; they are personal feedback, not a performance diagnosis.
- Historical progress is evaluated against the current habit target and schedule. Archive and recreate a habit if a new target should have a separate history. The full backup retains archived habits and every log.
- Custom habit comparisons run alongside the existing comparisons before false-discovery correction. An unrecorded skip is not added to the “without” group. The engine needs at least five measured examples in each group; a calendar with ten days alone is insufficient.
- Backup restore fills missing records. An existing date/period, habit ID, or habit/date log wins over the imported copy. This protects newer data and makes repeated restoration safe. The Postgres import is one atomic statement, and the local import is one serialised file mutation.

## Acceptance and verification

The automated checks cover the existing statistics against planted effects and noise, real Postgres-compatible SQL, habit schedules and streaks, numerical boundaries, unknown answers, enriched exports, safe spreadsheet strings, and concurrent development-store saves. Browser checks use a separate local database file and a test-only passcode; they do not access the live diary.

Browser acceptance includes private navigation, create/complete/reopen/edit/archive/restore, counter increments and exact corrections, earlier-week edits, diary fallback after clearing a quick log, visible rollback after an injected server failure, draft recovery after reload, preservation of full diary notes during a quick save, JSON exports and restores, invalid calendar dates, cross-origin rejection, and sign-out. Representative synthetic diary data is checked across Today, Habits, Insights, History, and Settings on desktop and phone, in light/dark appearances. Preview images use synthetic data.

Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run test:e2e`. The browser command also creates a production build. The shipped browser configuration uses `/usr/bin/chromium`; set `PLAYWRIGHT_CHROMIUM_PATH` on another machine, or use the browser installation workflow described in README.

## Priorities after this release

1. **Use the app for two weeks and tune the default quick flow.** Start with two or three habits. Measure how long check-ins take, which questions are usually skipped, and whether the weekly suggestion leads to a useful adjustment. Prioritise relevance over adding more fields. Personal defaults remain adjustable through Habits; the quick diary currently uses a fixed core set.
2. **Add reliable, optional reminders.** Browser push requires explicit notification permission, subscriptions, a scheduled server job, delivery tracking, and correct timezone handling. This release does not claim to deliver push reminders. Choose times from real usage first; avoid constant prompts.
3. **Add encrypted offline operation if needed.** Current check-in drafts survive on the device, and open screens report offline status. A fresh offline launch still shows the offline fallback; quick habit actions require a connection. A full offline queue needs durable retry, version conflicts, sign-out isolation, and recovery testing before it should promise successful saving.
4. **Strengthen simultaneous-edit handling.** Distinct habit/day logs do not overwrite a diary. Updates to the same diary or habit/day still use the latest completed write. Before heavy use across devices, add record versions and a clear conflict-resolution flow. Refresh-on-return and stale-response guards reduce client races; they are not a database conflict protocol.
5. **Make weekly experiments explicit.** The reset currently recommends a small adjustment from the recent record. A future experiment feature should save a proposed action, outcome, and review date, then compare comparable periods cautiously. Do not call a correlation causal or label a routine change successful from a tiny sample.
6. **Verify operational readiness on the hosted deployment.** Confirm production uses Neon, perform a backup/export/restore rehearsal in a separate database, check Vercel error logs and availability, verify installed-app behaviour on the actual phone, and measure real network performance. Set up provider backups and alerts through the existing hosting account. These require hosted access and cannot be established by a local build.

## Success measures

The useful outcome is better habit execution and better-informed adjustments, not more time spent in the app. Proposed targets to evaluate, not measured claims:

- First habit configured within 60 seconds; simple actions logged in one tap.
- Median quick check-in under 60 seconds on the user's phone; no repeated entry required for linked measurements.
- Record activity on at least five days each week without feeling pressure to maintain a perfect streak.
- Make and review one small adjustment per week; assess against a personal baseline over several weeks.
- No silent save failures; restore preserves current records and can be repeated safely.
- Hosted 75th-percentile LCP under 2.5 seconds, INP under 200ms, and CLS under 0.1. Local automated checks do not establish hosted field performance.

## Release approach

The database changes are additive: `habits` and `habit_logs` are created through the existing initialisation path. Existing `entries` are unchanged. Deploy through the current Next.js/Vercel/Neon setup. Export a full backup first, review a preview deployment, and smoke-test login, one diary update, a habit log, export, and sign-out on the actual device before treating the hosted release as accepted. A source change or successful local build does not establish that the live URL has changed.

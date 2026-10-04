# My Day: competitive benchmark and improvement priorities

Prepared 4 October 2026. Scope: a private, primarily phone-based habit and performance tool for one user.

## Evidence and scope

This is a provisional competitive assessment, not a current market-share ranking or hands-on competitor usability test. This environment has no web research tool and its enforced network policy excludes the competitor sites. Competitor descriptions below therefore use established product capabilities from prior knowledge; current availability, pricing, subscription tiers and platform differences have not been independently verified. Official product links are provided as reference destinations, not pages accessed during this review.

The My Day baseline is the upgraded implementation documented in `docs/product-assessment.md`, including custom habits, quick logging and weekly review. Those changes were delivered in a preview/draft PR; this report does not assume they have been merged into the live app. Comparing only the original live diary would produce additional gaps already addressed in that upgrade.

## Three relevant benchmarks

These are selected for relevance to the intended experience, rather than an unsupported claim that they are the three largest apps.

| Product | Established strengths | What My Day should learn |
| --- | --- | --- |
| [Streaks](https://streaksapp.com/) | Compact, visual task completion; configurable recurring tasks; reminders; timed tasks; Apple ecosystem interactions including widgets/Watch and health-linked completion | Recording should fit around the action. Give the user an immediate, unambiguous completion response and minimise navigation. Automate appropriate measurements where practical. |
| [Habitify](https://habitify.me/) | Habit organisation into routines/time periods; reminders; flexible goals; progress reporting; access across platforms | Show the relevant habits at the relevant time, and provide a dependable cue to return. A growing habit list needs organisation rather than more dashboard clutter. |
| [Daylio](https://daylio.net/) | Fast mood and activity logging with icons; custom activities; notes; mood/activity statistics; goals, reminders and progress feedback | Make reflection personal and quick. Connect behaviour to felt outcomes using understandable visual feedback, without requiring a long diary entry. |

Streaks is chiefly a native Apple benchmark. Its widgets, Watch experience and health access cannot simply be reproduced inside a browser. Habitify is the closest broad habit-management benchmark; Daylio is relevant because My Day already combines habits with mood, energy, stress and personal context.

## What My Day already has

The upgraded app covers much of the basic checklist: custom binary and numerical habits, selected weekdays and flexible weekly frequency, cues, quick completion/undo, counters, corrections, archive/restore, streaks, history, quick/full diary modes, trends, exports and additive backup restore.

It also has a potentially useful distinction: habits can be considered alongside sleep, mood, energy, stress, training and household context. Statistical comparisons preserve unknown values and control for multiple comparisons. These are foundations; they do not establish that users understand the insights or improve their behaviour.

The largest remaining gap is the complete daily experience: remember the action, record it anywhere, understand the feedback, then make one worthwhile adjustment.

## Required improvements

### 1. Dependable saving and offline use — release gate

**Current gap:** drafts are stored locally and connection failures are visible, but a fresh offline launch cannot open the working app and habit logging requires a network connection. Simultaneous edits to the same record do not have a conflict protocol.

**Required work:** a durable local queue with stable operation IDs, retry and deduplication; offline access to the daily view; explicit saved-on-device versus synced state; versioned writes and conflict handling; appropriate protection for locally stored personal data; clear sign-out and device-storage behaviour. Add hosted error/availability monitoring, database backup verification and an isolated restore rehearsal.

**Acceptance:** complete and edit a habit in airplane mode, close the app, reopen it and reconnect without loss or duplication. A stale second device must not silently overwrite newer data. Exercise the restore path with representative records. This is an engineering requirement, not a claim that every benchmark implements the same design.

### 2. Useful reminders — highest-priority engagement feature

**Current gap:** no reliable push reminders.

**Required work:** optional habit/routine reminders, chosen local times, quiet hours, snooze, completion-aware suppression and a daily check-in reminder. Handle timezone and daylight-saving changes; maintain push subscriptions and distinguish dispatch acceptance from confirmed delivery where the platform permits. Explain device eligibility during setup.

**Acceptance:** a reminder opens the relevant action, stops after completion and does not arrive at yesterday's timezone offset. Test on the actual phone. Browser push depends on platform support; on iPhone/iPad it requires a supported installed Home Screen web app and permission. Do not promise native notification action parity without device validation.

### 3. A personalised daily view — highest-priority usability feature

**Current gap:** the tracker works, but the quick diary question set is fixed and personal defaults are partly defined in source configuration.

**Required work:** user-defined order and morning/day/evening groups; optional compact display of completed actions; pinned habits; configurable quick-check-in questions with full history preserved; editable labels and personal context. Keep normal habit completion accessible without opening a form.

**Acceptance:** the user configures two or three meaningful habits and a short check-in without code changes. A typical quick check-in takes less than 30 seconds in real use, without sacrificing the selected outcome measurements. This is a proposed target, not a measured result.

### 4. Recovery-friendly scheduling and honest history

**Current gap:** weekly goals and rest days exist, but there is no explicit illness/holiday pause or excused state. Historical progress is recalculated against the current target/schedule.

**Required work:** distinguish completed, deliberately not completed, excused and unrecorded; pause with clear date boundaries; preserve effective dates for goal/schedule changes. Show rolling consistency and progress towards the weekly goal alongside streaks. Make returning after a lapse easy.

**Acceptance:** increasing a target next Monday does not rewrite last month's achievements. A paused day is visibly paused and is neither a fabricated completion nor silently missing. Completion denominators and analytical exclusions must remain explainable. This recommendation extends the benchmarks rather than asserting universal competitor parity.

### 5. Turn weekly review into a saved improvement experiment

**Current gap:** the weekly reset surfaces progress and a heuristic suggestion but does not save a commitment or evaluate it later.

**Required work:** choose one action, one relevant outcome and a review date. Save the baseline and the proposed change. At review, show adherence, available outcome measurements and whether to continue, simplify or try something else. Longer observation periods should be available when one week gives insufficient evidence.

**Example:** “Walk outside after lunch on four days; review afternoon energy in two weeks.” The app should show what was actually recorded and the sample size, rather than announce that walking caused an improvement.

**Acceptance:** an experiment survives reload, appears during the week and returns at the chosen review date. Sparse data produces an honest insufficient-evidence message. This is a proposed differentiator, not a feature attributed to all three competitors.

### 6. Make outcome feedback easier to understand

**Current gap:** extensive analytics can demand interpretation; the aggregate day score is not a user-selected performance objective.

**Required work:** let the user choose primary outcomes such as energy, sleep or stress. Present a small number of plain-language observations, measurement coverage, sample counts and a link to supporting data. Let the user dismiss irrelevant observations. Explain the day score and preserve raw measurements.

**Acceptance:** within a minute, the user can answer “What am I tracking, what seems to be changing, and what will I try next?” Insufficient observations and associations must remain distinguishable from established effects.

### 7. Reduce manual entry with selective automation

**Current gap:** activity and sleep measurements are entered manually; no wearable/health integration.

**Required work:** first select the actual data source/device used. Import only high-value measurements, initially steps, sleep or workouts where supported. Record source, timestamp and units; deduplicate; allow correction and revocation. Never silently replace a deliberate manual entry.

**Constraint:** Apple Health/HealthKit is not directly available to a normal web app. A native companion or a deliberately chosen intermediary would be a separate architectural decision. Avoid assuming a thin wrapper alone solves this. Reassess native widgets and Watch interactions only after real usage demonstrates their value.

### 8. Optional timed routines and restrained rewards

Add a resumable timer only if reading, meditation or focus habits justify it. Prefer clear completion feedback, weekly milestones, remembered wins and personal bests over an elaborate points economy. Respect reduced motion. Rewards should help the user return and act, while keeping time spent managing the app low.

## Recommended sequence

1. Verify the preview on the user's actual phone and hosted storage; close production reliability gaps. Implement offline durability, write conflicts and historical goal versioning as the data foundation.
2. Add reminders, routine grouping and custom quick check-ins. Validate whether these remove the daily friction in two weeks of ordinary use.
3. Add outcome selection and saved experiments. Measure whether a review results in an action and whether the next review actually happens.
4. Add one useful integration or timer based on observed manual-entry burden. Consider native distribution only when necessary to support valued device capabilities.

Do not prioritise social feeds, public leaderboards, a large coaching-content library, monetisation or multi-user collaboration for the current single-user goal. An AI coach is also lower priority than reliable records and understandable, evidence-linked feedback.

## How to judge success

Use minimal, private instrumentation with no diary text in telemetry. Compare the user's own baseline rather than interpreting one person's usage as a population-level retention study.

- First useful habit created within 60 seconds.
- Simple completion takes one tap; chosen quick check-in takes under 30 seconds in typical use.
- No lost or duplicated logs in offline/reconnect and conflicting-edit acceptance tests.
- The user returns after a missed day without needing to repair a streak.
- Each completed review records one decision; later reviews revisit that decision.
- After two weeks, remove or simplify questions that add effort without informing decisions.
- Assess personal outcome trends over sufficient observations; engagement alone does not prove habit or performance improvement.

## Conclusion

My Day should combine Streaks' low-effort completion, Habitify's timely routine support and Daylio's fast personal reflection. The strongest product direction is a dependable daily action loop followed by a short, evidence-informed weekly decision. The next investment should be in reliability, reminders and personalisation, followed by experiments and clearer outcome feedback.

No application behaviour or deployment was changed for this assessment. Current competitor feature verification and hands-on comparisons remain outstanding because live research access was unavailable.

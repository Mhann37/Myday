# My Day

A private, mobile-first diary you fill in twice a day: a one-minute **morning** check-in and a two-minute **night** check-in. The point is the data. After a few weeks, the **Insights** screen shows which habits actually go with your better and worse days.

Built with Next.js, hosted on Vercel, data stored in your own Neon Postgres database. Single-user, protected by a passcode.

## What it tracks

| Check-in | Indicators |
| --- | --- |
| **Morning** | Hours slept, sleep quality, your mood / energy / stress, how your wife is feeling (mood + sick / flat / tired / stressed), injuries |
| **Night** | Mood / energy / stress again, work (home / office / day off + hours), lifted weights (+ session), cardio (+ type, minutes), wife mood and tags, quality time together, each kid's behaviour (Harvey, Leni, Marshall) with tags, one-on-one time, injuries, medication (Panadol, Nurofen, weight loss, other), alcohol, caffeine, water, junk food, steps, time outside, screen time, one win, gratitude, notes |

Unanswered questions are stored as *missing*, never as a default, so the analysis stays honest. Injuries carry forward from your last check-in, so you only update them.

Names, option lists and body parts live in [`lib/config.ts`](lib/config.ts). Change "Wife" to a real name there if you like.

### Insights

- **Day score** (0 to 100) from mood, energy and inverted stress, with a 7-day rolling average on longer ranges
- Trend charts, a calendar heatmap, best days of the week, sleep, kids, wife, training and work, habits, medication, injuries
- **What seems to matter:** compares every behaviour against every outcome, same day and next morning ("Your sleep quality that night is 1.8 lower on days you had alcohol"). With about 250 comparisons at once, some would look convincing by pure chance, so each one gets a cautious t-test and the whole set is corrected for false discoveries (Benjamini-Hochberg). Only findings that survive are shown, labelled *Early signal*, *Taking shape* or *Strong pattern*. Patterns are not proof of cause.
- Export from Settings: daily summary CSV (one row per day, best for spreadsheets), every answer as CSV, or a full JSON backup

## Set it up (one time, about 10 minutes)

The code is in this GitHub repo. You need a Vercel account (free Hobby plan is fine) and nothing else. Neon is added from inside Vercel. Vercel's menus change from time to time, so if a button label differs slightly from what's written here, pick the closest match.

### 1. Import the project into Vercel

1. Go to <https://vercel.com> and sign in with **Continue with GitHub**.
2. Click **Add New…** then **Project**.
3. Find **Mhann37/Myday** in the list and click **Import**. If it isn't listed, click **Adjust GitHub App Permissions**, grant access to the repo, then come back.
4. Leave **Framework Preset** as **Next.js** and leave the build settings alone.
5. Open the **Environment Variables** section and add these two:
   - Name `APP_PASSCODE`, value: the passcode you'll type to open the app. Make it long. A short phrase like `purple-kettle-sunrise-42` is ideal.
   - Name `AUTH_SECRET`, value: any long random string (mash the keyboard for 30 characters).
6. Click **Deploy**. The first deploy will succeed, but the app can't save anything until step 2.

### 2. Add the database (Neon)

1. In your new Vercel project, open the **Storage** tab.
2. Click **Create Database** (or **Browse Marketplace**) and choose **Neon** (Postgres).
3. Accept the defaults (free plan, pick the region nearest you) and click **Create** / **Connect**.
4. When asked which project to connect, pick **Myday** and tick **all environments** (Production, Preview, Development). Vercel adds `DATABASE_URL` for you.
5. Go to the **Deployments** tab, open the latest deployment's **⋯** menu and click **Redeploy**. This lets the app see the new variable.

The tables are created automatically the first time the app runs. There is nothing to run or migrate.

### 3. Open it and install it on your phone

1. Open your project URL (shown on the Vercel project page, like `myday-xyz.vercel.app`) in **Chrome on your Android phone**.
2. Enter your passcode. You stay signed in on that phone for 6 months.
3. Tap the **⋮** menu at the top right and choose **Install app** (or **Add to Home screen**), then tap **Install**.
4. The My Day icon is now on your home screen and opens full-screen like an app. (Settings in the app also has an **Install app** button.)

### 4. Which branch does Vercel deploy?

Vercel deploys your repository's **default branch** to the live URL (Production). Other branches get their own preview URLs. If the live URL shows a 404 or "no deployment", open the project's **Settings** and look for the **Production Branch** setting (it sits under **Git**, or under **Environments → Production → Branch Tracking**, depending on your Vercel's layout) and set it to the branch that holds this code.

## Day to day

- **Morning:** open the app, tap **Morning**, answer what you can, **Save**.
- **Night:** same with **Night**. After midnight (until 4am) a check-in still counts toward the day that just ended.
- Missed a day? **History** shows every day, including gaps. Tap a day to fill it in or edit it.
- Unsaved answers are kept on your phone as a draft, so a dropped connection or closed tab won't lose them.

## Changing your passcode

In Vercel: **Settings → Environment Variables**, edit `APP_PASSCODE`, then **Redeploy**. Every device is signed out and needs the new passcode.

## Running it locally (optional)

```bash
npm install
cp .env.example .env.local   # then set APP_PASSCODE
npm run dev                  # http://localhost:3000
```

With no `DATABASE_URL`, local development uses a throwaway JSON file in `.data/` (never used on Vercel). To see the charts and insights with made-up data:

```bash
npm run seed                 # ~75 days of demo check-ins, written to .data/ only
```

Other commands: `npm test` (analytics, statistics, auth, and the real SQL run against an in-memory Postgres), `npm run lint`, `npm run typecheck`, `npm run build`.

## How it's built

- **Next.js (App Router) + TypeScript + Tailwind**, installable as a PWA (`app/manifest.ts`, `public/sw.js`)
- **Auth:** one passcode (`APP_PASSCODE`). A correct entry sets a signed, expiring, `httpOnly` cookie. Failed attempts are throttled (8 per 15 minutes), and every API route re-checks the cookie.
- **Storage:** one `entries` table, `(entry_date, period)` primary key, answers as `jsonb`. Adding a new indicator never needs a migration. Date logic uses plain local `YYYY-MM-DD` strings.
- **Insights engine:** [`lib/analytics.ts`](lib/analytics.ts) and [`lib/stats.ts`](lib/stats.ts), tested against synthetic data with known planted effects and against pure noise.
- **Charts:** hand-built SVG using a colour palette validated for colour-blind safety in light and dark mode, each with a "View as table" fallback.

## Ideas for later

- Push reminders at your chosen morning and night times (works on Android once installed; needs a small scheduled job)
- Weekly summary, goals ("lift 3x a week") and streak badges
- More outcomes in the insights engine, such as the next day's kids' behaviour

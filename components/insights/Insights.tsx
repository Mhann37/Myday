"use client";

import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  MIN_DAYS_FOR_INSIGHTS,
  average,
  buildDays,
  computeInsights,
  currentStreak,
  injurySummary,
  outcomeFormat,
  pickInsights,
  rate,
  rollingMean,
  weekdayPattern,
  OUTCOMES,
  type DayRecord,
  type Insight,
} from "@/lib/analytics";
import { useEntries, useNow } from "@/lib/client";
import { KIDS, MEDS, SEVERITY_LABELS, WIFE_NAME } from "@/lib/config";
import { addDays, dateRange, formatDayMonth } from "@/lib/dates";
import { round1, signed } from "@/lib/format";
import type { Entry } from "@/lib/schema";
import { Card, cn } from "../ui";
import { Heatmap, Meter, TrendChart, WeekdayBars, type Series } from "./charts";

type Range = 14 | 30 | 90 | 0;
const RANGES: { value: Range; label: string }[] = [
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: 0, label: "All" },
];

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="rise mt-6">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      <Card className="mt-3">{children}</Card>
    </section>
  );
}

export function Insights() {
  const now = useNow();
  const { entries, error, refresh } = useEntries();
  const [range, setRange] = useState<Range>(30);
  const allDays = useMemo(() => (entries ? buildDays(entries) : []), [entries]);

  if (!now || !entries) {
    return (
      <div className="space-y-3 px-4" aria-busy="true">
        {error ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="mb-3 text-bad">{error}</p>
            <button onClick={() => void refresh()} className="rounded-xl bg-accent px-4 py-2 font-semibold text-on-accent">
              Try again
            </button>
          </div>
        ) : (
          [0, 1, 2].map((i) => <div key={i} className="h-48 animate-pulse rounded-3xl bg-surface-2/60" />)
        )}
      </div>
    );
  }

  return <InsightsBody entries={entries} allDays={allDays} today={now.today} range={range} setRange={setRange} />;
}

function InsightsBody({
  entries,
  allDays,
  today,
  range,
  setRange,
}: {
  entries: Entry[];
  allDays: DayRecord[];
  today: string;
  range: Range;
  setRange: (r: Range) => void;
}) {
  const first = allDays[0]?.date ?? today;
  const from = range === 0 ? first : addDays(today, -(range - 1));
  const dates = useMemo(() => dateRange(from < first ? first : from, today), [from, first, today]);
  const days = useMemo(() => allDays.filter((d) => d.date >= dates[0] && d.date <= today), [allDays, dates, today]);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const insights = useMemo(() => computeInsights(days), [days]);
  const picked = useMemo(() => pickInsights(insights), [insights]);
  const weekdays = useMemo(() => weekdayPattern(days), [days]);
  const scores = useMemo(() => new Map(days.filter((d) => d.wellbeing !== undefined).map((d) => [d.date, d.wellbeing!])), [days]);
  const injuryRows = useMemo(() => injurySummary(entries.filter((e) => e.date >= dates[0] && e.date <= today)), [entries, dates, today]);

  if (allDays.length === 0) {
    return (
      <div className="px-4">
        <Card className="text-center">
          <p className="font-display text-2xl font-semibold">Nothing to chart yet</p>
          <p className="mt-2 text-ink-2">Log your first morning or night check-in and your trends will start to appear here. The patterns get interesting after a couple of weeks.</p>
        </Card>
      </div>
    );
  }

  // Over a month or more, daily values bounce around too much to read, so lines show a 7-day rolling average.
  const smooth = range !== 14;
  const series = (get: (d: DayRecord) => number | undefined) => {
    const raw = dates.map((d) => (byDate.has(d) ? get(byDate.get(d)!) : undefined));
    return smooth ? rollingMean(raw, 7) : raw;
  };
  const kind = smooth ? "7-day rolling average" : "Daily values";
  const meSeries: Series[] = [
    { key: "mood", label: "Mood", color: "var(--series-1)", values: series((d) => d.mood) },
    { key: "energy", label: "Energy", color: "var(--series-2)", values: series((d) => d.energy) },
    { key: "stress", label: "Stress", color: "var(--series-3)", values: series((d) => d.stress) },
  ];
  const kidSeries: Series[] = KIDS.map((k, i) => ({
    key: k.key,
    label: k.name,
    color: `var(--series-${i + 1})`,
    values: series((d) => d.kids[k.key]),
  }));

  const score = average(days, (d) => d.wellbeing);
  const prevFrom = range === 0 ? undefined : addDays(today, -(range * 2 - 1));
  const prevTo = range === 0 ? undefined : addDays(today, -range);
  const prevScore = prevFrom && prevTo ? average(allDays.filter((d) => d.date >= prevFrom && d.date <= prevTo), (d) => d.wellbeing) : undefined;
  const delta = score !== undefined && prevScore !== undefined ? score - prevScore : undefined;
  const possible = dates.length * 2;
  const done = days.reduce((n, d) => n + (d.hasMorning ? 1 : 0) + (d.hasNight ? 1 : 0), 0);
  const streak = currentStreak(allDays, today);

  const lifted = rate(days, (d) => d.lifted);
  const cardio = rate(days, (d) => d.cardio);
  const wfh = rate(days, (d) => (d.work === undefined ? undefined : d.work === "wfh"));
  const office = rate(days, (d) => (d.work === undefined ? undefined : d.work === "office"));
  const off = rate(days, (d) => (d.work === undefined ? undefined : d.work === "none"));

  const medRate = (key: string) => rate(days, (d) => ({ panadol: d.panadol, nurofen: d.nurofen, weightloss: d.weightLoss, other: d.otherMed })[key]);
  const alcoholDays = rate(days, (d) => (d.alcohol === undefined ? undefined : d.alcohol > 0));
  const junkDays = rate(days, (d) => (d.junk === undefined ? undefined : d.junk >= 2));
  const wifeTimeDays = rate(days, (d) => d.wifeTime);
  const oneOnOneDays = rate(days, (d) => (d.oneOnOne === undefined ? undefined : d.oneOnOne > 0));
  const wifeUnwellDays = rate(days, (d) => d.wifeUnwell);
  const sleepAvg = average(days, (d) => d.sleepHours);
  const sleepQ = average(days, (d) => d.sleepQuality);
  const wifeAvg = average(days, (d) => d.wifeMood);
  const dayCount = (r: { yes: number; of: number }) => (r.of ? `${r.yes} of ${r.of} days` : "no data");
  const avgRow = (label: string, v: number | undefined, unit = "", digits = 1) => (
    <div className="flex items-baseline justify-between py-2.5 text-[15px]" key={label}>
      <span className="text-ink-2">{label}</span>
      <span className="font-semibold tabular-nums">{v === undefined ? "–" : `${digits === 0 ? Math.round(v).toLocaleString("en-AU") : v.toFixed(digits)}${unit}`}</span>
    </div>
  );

  return (
    <div className="px-4 pb-4">
      <div className="flex gap-2" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.value}
            type="button"
            aria-pressed={range === r.value}
            onClick={() => setRange(r.value)}
            className={cn(
              "h-10 flex-1 rounded-full border text-sm font-semibold transition active:scale-95",
              range === r.value ? "border-transparent bg-ink text-bg" : "border-line bg-surface text-ink-2",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Hero */}
      <section className="rise mt-6">
        <Card>
          <div className="text-sm font-medium text-ink-2">Average day score</div>
          <div className="mt-1 flex items-end gap-3">
            <div className="text-[64px] font-semibold leading-none">{score === undefined ? "–" : Math.round(score)}</div>
            {delta !== undefined && Math.abs(delta) >= 0.5 && (
              <div className={cn("mb-2 inline-flex items-center gap-0.5 text-sm font-semibold", delta > 0 ? "text-good" : "text-bad")}>
                {delta > 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                {signed(delta, 0)} vs previous {range} days
              </div>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">Built from your mood, energy and (inverted) stress. 0 is rough, 100 is brilliant.</p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-center">
            <Mini label="Days logged" value={String(days.length)} />
            <Mini label="Check-ins" value={`${Math.round((done / Math.max(possible, 1)) * 100)}%`} />
            <Mini label="Streak" value={`${streak}d`} />
          </div>
        </Card>
      </section>

      <Block title="Mood, energy & stress" sub={`${kind}, 1 to 5. For stress, lower is better.`}>
        <TrendChart dates={dates} series={meSeries} ariaLabel="Mood, energy and stress by day" />
      </Block>

      <Block title="Day by day" sub="How each day scored. Darker is better.">
        <Heatmap scores={scores} today={today} weeks={Math.min(15, Math.max(8, Math.ceil(dates.length / 7) + 1))} />
      </Block>

      <section className="rise mt-6">
        <h2 className="font-display text-xl font-semibold">What seems to matter</h2>
        <p className="mt-0.5 text-sm text-muted">Behaviours that go with better or worse days, from your own data.</p>
        <InsightsPanel days={days.length} insights={insights} picked={picked} />
      </section>

      <Block title="Best days of the week" sub="Average day score by weekday.">
        {days.length >= 7 ? <WeekdayBars data={weekdays} /> : <p className="text-ink-2">Needs about a week of data.</p>}
      </Block>

      <Block title="Sleep" sub={sleepAvg === undefined ? undefined : `Averaging ${round1(sleepAvg)} hours${sleepQ === undefined ? "" : `, quality ${round1(sleepQ)} of 5`}. ${kind}.`}>
        {sleepAvg === undefined ? (
          <p className="text-ink-2">Log sleep in your morning check-in to see it here.</p>
        ) : (
          <TrendChart
            dates={dates}
            series={[{ key: "sleep", label: "Hours slept", color: "var(--series-1)", values: series((d) => d.sleepHours) }]}
            yMin={4}
            yMax={10}
            yTicks={[4, 6, 8, 10]}
            ariaLabel="Hours slept by day"
          />
        )}
      </Block>

      <Block title="The kids" sub={`${kind} of behaviour, 1 (rough) to 5 (angel).`}>
        {kidSeries.some((s) => s.values.some((v) => v !== undefined)) ? (
          <>
            <TrendChart dates={dates} series={kidSeries} ariaLabel="Kids' behaviour by day" />
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              {KIDS.map((k, i) => {
                const avg = average(days, (d) => d.kids[k.key]);
                return <Meter key={k.key} label={k.name} value={avg ?? 0} max={5} color={`var(--series-${i + 1})`} right={avg === undefined ? "–" : `${round1(avg)} avg`} />;
              })}
            </div>
          </>
        ) : (
          <p className="text-ink-2">Rate each child in your night check-in to see how they&apos;re going.</p>
        )}
      </Block>

      <Block title={WIFE_NAME} sub={`${kind} of mood, and how many days were flat or sick.`}>
        {wifeAvg === undefined ? (
          <p className="text-ink-2">Log how {WIFE_NAME.toLowerCase()} is feeling to see it here.</p>
        ) : (
          <>
            <TrendChart dates={dates} series={[{ key: "wife", label: `${WIFE_NAME}'s mood`, color: "var(--series-1)", values: series((d) => d.wifeMood) }]} ariaLabel={`${WIFE_NAME}'s mood by day`} />
            <div className="mt-3 divide-y divide-line border-t border-line">
              {avgRow("Average mood", wifeAvg)}
              <div className="flex items-baseline justify-between py-2.5 text-[15px]">
                <span className="text-ink-2">Flat or sick days</span>
                <span className="font-semibold tabular-nums">{dayCount(wifeUnwellDays)}</span>
              </div>
            </div>
          </>
        )}
      </Block>

      <Block title="Training & work">
        <div className="space-y-4">
          <Meter label="Lifted weights" value={lifted.yes} max={lifted.of} right={dayCount(lifted)} />
          <Meter label="Cardio" value={cardio.yes} max={cardio.of} right={dayCount(cardio)} />
          <Meter label="Worked from home" value={wfh.yes} max={wfh.of} right={dayCount(wfh)} color="var(--series-2)" />
          <Meter label="Worked at the office" value={office.yes} max={office.of} right={dayCount(office)} color="var(--series-2)" />
          <Meter label="Not working" value={off.yes} max={off.of} right={dayCount(off)} color="var(--series-2)" />
        </div>
        <div className="mt-3 divide-y divide-line border-t border-line">
          {avgRow("Cardio session average", average(days.filter((d) => d.cardio), (d) => d.cardioMins), " min", 0)}
          {avgRow("Hours worked on work days", average(days.filter((d) => d.work && d.work !== "none"), (d) => d.workHours), "h")}
        </div>
      </Block>

      <Block title="Habits" sub="Averages and counts across logged days.">
        <div className="divide-y divide-line">
          {avgRow("Caffeinated drinks a day", average(days, (d) => d.caffeine))}
          {avgRow("Water, glasses a day", average(days, (d) => d.water))}
          {avgRow("Steps a day", average(days, (d) => d.steps), "", 0)}
          {avgRow("Time outside", average(days, (d) => d.outdoorMins), " min", 0)}
          {avgRow("Screen time", average(days, (d) => d.screenHours), "h")}
          <div className="flex items-baseline justify-between py-2.5 text-[15px]"><span className="text-ink-2">Days with alcohol</span><span className="font-semibold tabular-nums">{dayCount(alcoholDays)}</span></div>
          <div className="flex items-baseline justify-between py-2.5 text-[15px]"><span className="text-ink-2">Heavy junk-food days</span><span className="font-semibold tabular-nums">{dayCount(junkDays)}</span></div>
          <div className="flex items-baseline justify-between py-2.5 text-[15px]"><span className="text-ink-2">Quality time with {WIFE_NAME.toLowerCase()}</span><span className="font-semibold tabular-nums">{dayCount(wifeTimeDays)}</span></div>
          <div className="flex items-baseline justify-between py-2.5 text-[15px]"><span className="text-ink-2">One-on-one time with a kid</span><span className="font-semibold tabular-nums">{dayCount(oneOnOneDays)}</span></div>
        </div>
      </Block>

      <Block title="Medication & body">
        <div className="space-y-4">
          {MEDS.map((m) => {
            const r = medRate(m.key);
            return <Meter key={m.key} label={m.label} value={r.yes} max={r.of} right={dayCount(r)} color="var(--series-2)" />;
          })}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 text-[15px] font-semibold">Injuries</h3>
          {injuryRows.length === 0 ? (
            <p className="text-ink-2">None logged in this period.</p>
          ) : (
            <ul className="divide-y divide-line">
              {injuryRows.map((i) => (
                <li key={i.part} className="flex items-baseline justify-between py-2.5 text-[15px]">
                  <span>{i.part}</span>
                  <span className="text-ink-2">
                    {i.days} day{i.days === 1 ? "" : "s"} · worst: {SEVERITY_LABELS[i.worst - 1].toLowerCase()} · last {formatDayMonth(i.lastSeen)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Block>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold leading-tight">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

const CONFIDENCE = {
  early: "Early signal",
  forming: "Taking shape",
  solid: "Strong pattern",
} as const;

function InsightsPanel({ days, insights, picked }: { days: number; insights: Insight[]; picked: { helps: Insight[]; hurts: Insight[] } }) {
  if (days < MIN_DAYS_FOR_INSIGHTS) {
    return (
      <Card className="mt-3">
        <p className="text-ink-2">Patterns need at least {MIN_DAYS_FOR_INSIGHTS} logged days to be worth showing. You&apos;re on {days}.</p>
        <div className="mt-3">
          <Meter label="Progress" value={days} max={MIN_DAYS_FOR_INSIGHTS} right={`${days} / ${MIN_DAYS_FOR_INSIGHTS}`} />
        </div>
      </Card>
    );
  }
  if (insights.length === 0) {
    return (
      <Card className="mt-3">
        <p className="text-ink-2">No clear patterns yet. That&apos;s normal early on. Keep logging both check-ins and answer the habit questions, and they&apos;ll firm up.</p>
      </Card>
    );
  }
  return (
    <div className="mt-3 space-y-5">
      <InsightGroup title="Seems to help" icon={<TrendingUp size={18} className="text-good" />} items={picked.helps} />
      <InsightGroup title="Seems to drag" icon={<TrendingDown size={18} className="text-bad" />} items={picked.hurts} />
      <p className="px-1 text-xs text-muted">
        These are patterns, not proof. Every comparison is checked against the chance of fluke results, and only the ones that survive are shown. &ldquo;Early signal&rdquo; ones can still be chance, and they firm up as you log more days.
      </p>
    </div>
  );
}

function InsightGroup({ title, icon, items }: { title: string; icon: ReactNode; items: Insight[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
        {icon}
        {title}
      </h3>
      <div className="space-y-3">
        {items.map((i) => {
          const max = i.outcomeId === "wellbeing" ? 100 : i.outcomeId === "nextSleepH" ? 10 : 5;
          const outcome = OUTCOMES.find((o) => o.id === i.outcomeId)!;
          return (
            <Card key={i.id} className="!p-4">
              <p className="font-medium leading-snug">{i.headline}.</p>
              <div className="mt-3 space-y-2.5">
                <Meter label="With" value={i.withMean} max={max} color="var(--series-1)" right={`${outcomeFormat(i.outcomeId, i.withMean)} · ${i.nWith} days`} />
                <Meter label="Without" value={i.withoutMean} max={max} color="var(--axis)" right={`${outcomeFormat(i.outcomeId, i.withoutMean)} · ${i.nWithout} days`} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted">
                <span>{outcome.label.replace(/^your /, "")}</span>
                <span className={cn("rounded-full px-2 py-0.5 font-semibold", i.confidence === "early" ? "bg-surface-2 text-ink-2" : "bg-accent-soft text-accent")}>{CONFIDENCE[i.confidence]}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

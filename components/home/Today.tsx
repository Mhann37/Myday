"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Flame,
  Leaf,
  Moon,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  average,
  buildDays,
  currentStreak,
  rate,
  type DayRecord,
} from "@/lib/analytics";
import { summaryChips } from "@/lib/checkin";
import { setSaveNotice, useEntries, useNow, useSaveNotice } from "@/lib/client";
import { addDays, dateRange, formatLong, formatWeekday } from "@/lib/dates";
import { heatColor, heatText, round1, signed } from "@/lib/format";
import type { Entry, Period } from "@/lib/schema";
import { Card, cn } from "../ui";
import { HabitTracker } from "../habits/HabitTracker";
import { WeeklyReview } from "./WeeklyReview";
import { useHabits } from "@/lib/habit-client";
import { enrichDays } from "@/lib/habit-analytics";

export function Today() {
  const now = useNow();
  const { entries, error, loading, refresh } = useEntries();
  const { data: habitData } = useHabits();
  const days = useMemo(
    () => enrichDays(entries ? buildDays(entries) : [], habitData),
    [entries, habitData],
  );
  const savedNotice = useSaveNotice();

  if (!now) return <HomeSkeleton />;

  const { today, hour } = now;
  const greeting =
    hour < 4
      ? "Late one"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";
  const primary: Period = hour >= 4 && hour < 15 ? "morning" : "night";
  const find = (date: string, period: Period) =>
    entries?.find((e) => e.date === date && e.period === period);
  const yesterday = addDays(today, -1);
  const showCatchUp =
    !!entries &&
    entries.length > 0 &&
    !find(yesterday, "night") &&
    hour >= 4 &&
    hour < 23;
  const streak = currentStreak(days, today);

  return (
    <div className="px-4 pt-[max(env(safe-area-inset-top),1.5rem)]">
      <div className="mb-8 flex items-center gap-2 text-accent lg:hidden">
        <Leaf size={20} />
        <span className="font-display text-xl font-semibold">My Day</span>
        <span className="ml-auto text-[10px] font-medium tracking-widest text-muted">
          YOUR PRIVATE SPACE
        </span>
      </div>
      <header className="rise mb-7 flex items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">{formatLong(today).toUpperCase()}</p>
          <h1 className="font-display text-[34px] font-semibold leading-tight lg:text-[42px]">
            {greeting}.
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Small actions today. A better understanding of you tomorrow.
          </p>
        </div>
        {streak > 0 && (
          <div
            className="mt-1 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold"
            title="Consecutive days with a check-in or habit log"
          >
            <Flame size={16} className="text-morning" />
            {streak} day{streak === 1 ? "" : "s"}
          </div>
        )}
      </header>
      {savedNotice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-2xl border border-good/20 bg-good/10 p-4 text-sm text-good"
        >
          <Check size={17} className="shrink-0" />
          <span className="flex-1">{savedNotice}</span>
          <button
            type="button"
            aria-label="Dismiss save confirmation"
            onClick={() => setSaveNotice("")}
            className="min-h-11 px-2 text-lg"
          >
            ×
          </button>
        </div>
      )}

      {error && !entries && (
        <Card className="mb-4">
          <p className="mb-3 text-bad">{error}</p>
          <button
            onClick={() => void refresh()}
            className="rounded-xl bg-accent px-4 py-2 font-semibold text-on-accent"
          >
            Try again
          </button>
        </Card>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <div className="space-y-6">
          <HabitTracker compact />
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">
                Check in with yourself
              </h2>
              <span className="text-xs text-muted">A moment to notice</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PeriodCard
                period="morning"
                entry={find(today, "morning")}
                primary={primary === "morning"}
                loading={loading}
              />
              <PeriodCard
                period="night"
                entry={find(today, "night")}
                primary={primary === "night"}
                loading={loading}
              />
            </div>
          </section>

          {showCatchUp && (
            <Link
              href={`/checkin/night?date=${yesterday}`}
              className="mt-3 flex items-center justify-between rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-ink-2 active:bg-surface-2"
            >
              <span>
                Last night&apos;s check-in is missing.{" "}
                <span className="font-semibold text-ink">Add it</span>
              </span>
              <ChevronRight size={18} className="text-muted" />
            </Link>
          )}

          {days.length > 0 && (
            <>
              <WeekStrip days={days} today={today} />
            </>
          )}
        </div>
        <aside className="space-y-6">
          <WeeklyReview />
          {days.length > 0 && <WeekTiles days={days} today={today} />}
          <div className="rounded-2xl border border-dashed border-line p-4">
            <p className="eyebrow">THE LONG GAME</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              You don’t need a perfect streak. An honest record and one small
              adjustment each week are enough to start learning.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="px-4 pt-6" aria-busy="true">
      <div className="mb-6 h-10 w-52 animate-pulse rounded-xl bg-surface-2/70" />
      <div className="space-y-3">
        <div className="h-36 animate-pulse rounded-3xl bg-surface-2/60" />
        <div className="h-36 animate-pulse rounded-3xl bg-surface-2/60" />
      </div>
    </div>
  );
}

function PeriodCard({
  period,
  entry,
  primary,
  loading,
}: {
  period: Period;
  entry: Entry | undefined;
  primary: boolean;
  loading: boolean;
}) {
  const morning = period === "morning";
  const Icon = morning ? Sun : Moon;
  const chips = entry ? summaryChips(entry.data, period) : [];
  const href = `/checkin/${period}`;

  return (
    <Link
      href={href}
      data-period={period}
      className={cn(
        "rise relative block overflow-hidden rounded-3xl border p-5 transition active:scale-[0.99]",
        primary && !entry ? "border-accent/40 shadow-lg" : "border-line",
      )}
      style={{
        background: morning
          ? "linear-gradient(135deg, var(--morning-soft), var(--surface) 70%)"
          : "linear-gradient(135deg, var(--night-soft), var(--surface) 70%)",
      }}
    >
      <Icon
        aria-hidden
        size={92}
        strokeWidth={1.2}
        className="pointer-events-none absolute -right-4 -top-4 text-accent opacity-[0.13]"
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-accent">
          <Icon size={16} />
          {morning ? "Morning" : "Night"}
          {entry && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] normal-case tracking-normal text-on-accent">
              <Check size={12} strokeWidth={3} /> Done
            </span>
          )}
        </div>

        {entry ? (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.length ? (
                chips.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-surface/80 px-2.5 py-1 text-[13px] font-medium text-ink-2 ring-1 ring-line"
                  >
                    {c}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">Saved</span>
              )}
            </div>
            <div className="mt-3 text-sm font-semibold text-ink-2">
              Tap to edit
            </div>
          </>
        ) : (
          <>
            <div className="font-display mt-2 text-2xl font-semibold">
              {morning
                ? "How are you starting the day?"
                : "How did the day go?"}
            </div>
            <div className="mt-1 text-sm text-ink-2">
              {loading
                ? " "
                : morning
                  ? "Sleep, mood, energy, family. About a minute."
                  : "Training, kids, habits and more. A couple of minutes."}
            </div>
            <div
              className={cn(
                "mt-4 inline-flex h-11 items-center gap-1.5 rounded-2xl px-5 text-[15px] font-semibold",
                primary
                  ? "bg-accent text-on-accent"
                  : "bg-surface/80 text-ink ring-1 ring-line",
              )}
            >
              Quick check-in <ChevronRight size={18} />
            </div>
          </>
        )}
      </div>
    </Link>
  );
}

function WeekStrip({ days, today }: { days: DayRecord[]; today: string }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const range = dateRange(addDays(today, -6), today);
  return (
    <section className="rise mt-8" aria-label="Last 7 days">
      <h2 className="font-display mb-3 text-xl font-semibold">Last 7 days</h2>
      <Card className="flex justify-between gap-1 !p-3">
        {range.map((date) => {
          const d = byDate.get(date);
          return (
            <div
              key={date}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <div className="text-xs font-medium text-muted">
                {formatWeekday(date).slice(0, 3)}
              </div>
              <Link
                href={`/checkin/${d?.hasNight ? "night" : "morning"}?date=${date}`}
                aria-label={`${formatWeekday(date)} ${date}: ${d?.wellbeing !== undefined ? `day score ${Math.round(d.wellbeing)}` : "no score"}, open check-in`}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full text-xs font-bold",
                  date === today &&
                    "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                )}
                style={{
                  background: heatColor(d?.wellbeing),
                  color: heatText(d?.wellbeing),
                }}
                title={
                  d?.wellbeing !== undefined
                    ? `Day score ${Math.round(d.wellbeing)}`
                    : "No data"
                }
              >
                {d?.wellbeing !== undefined ? Math.round(d.wellbeing) : ""}
              </Link>
              <div
                role="img"
                className="flex gap-1"
                aria-label={`${d?.hasMorning ? "Morning" : "No morning"}, ${d?.hasNight ? "night" : "no night"}`}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    d?.hasMorning ? "bg-morning" : "bg-line",
                  )}
                />
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    d?.hasNight ? "bg-night" : "bg-line",
                  )}
                />
              </div>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function Tile({
  label,
  value,
  delta,
  deltaText,
  upIsGood = true,
  sub,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  deltaText?: string;
  upIsGood?: boolean;
  sub?: string;
}) {
  const showDelta = delta !== undefined && Math.abs(delta) >= 0.05;
  const good = delta !== undefined && delta > 0 === upIsGood;
  return (
    <Card className="!p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-3xl font-semibold leading-tight">{value}</div>
      <div className="mt-1 flex h-5 items-center gap-1 text-[13px]">
        {showDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              good ? "text-good" : "text-bad",
            )}
          >
            {delta > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {deltaText}
          </span>
        ) : (
          <span className="text-muted">{sub}</span>
        )}
        {showDelta && <span className="text-muted">vs prior 7d</span>}
      </div>
    </Card>
  );
}

function WeekTiles({ days, today }: { days: DayRecord[]; today: string }) {
  const stats = useMemo(() => {
    const within = (from: number, to: number) =>
      days.filter(
        (d) => d.date >= addDays(today, from) && d.date <= addDays(today, to),
      );
    const cur = within(-6, 0);
    const prev = within(-13, -7);
    const diff = (a: number | undefined, b: number | undefined) =>
      a === undefined || b === undefined ? undefined : a - b;
    const score = average(cur, (d) => d.wellbeing);
    const sleep = average(cur, (d) => d.sleepHours);
    const stress = average(cur, (d) => d.stress);
    const active = rate(cur, (d) => d.exercised);
    const activePrev = rate(prev, (d) => d.exercised);
    return {
      score,
      scoreDelta: diff(
        score,
        average(prev, (d) => d.wellbeing),
      ),
      sleep,
      sleepDelta: diff(
        sleep,
        average(prev, (d) => d.sleepHours),
      ),
      stress,
      stressDelta: diff(
        stress,
        average(prev, (d) => d.stress),
      ),
      active,
      activeDelta:
        active.of && activePrev.of ? active.yes - activePrev.yes : undefined,
    };
  }, [days, today]);

  const dash = <span className="text-muted">–</span>;
  return (
    <section className="rise" aria-label="This week">
      <h2 className="font-display mb-3 text-xl font-semibold">This week</h2>
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Day score"
          value={stats.score === undefined ? dash : Math.round(stats.score)}
          delta={stats.scoreDelta}
          deltaText={
            stats.scoreDelta === undefined
              ? undefined
              : signed(stats.scoreDelta, 0)
          }
          sub="out of 100"
        />
        <Tile
          label="Sleep"
          value={stats.sleep === undefined ? dash : `${round1(stats.sleep)}h`}
          delta={stats.sleepDelta}
          deltaText={
            stats.sleepDelta === undefined
              ? undefined
              : `${signed(stats.sleepDelta)}h`
          }
          sub="average a night"
        />
        <Tile
          label="Stress"
          value={stats.stress === undefined ? dash : round1(stats.stress)}
          delta={stats.stressDelta}
          deltaText={
            stats.stressDelta === undefined
              ? undefined
              : signed(stats.stressDelta)
          }
          upIsGood={false}
          sub="1 calm - 5 maxed"
        />
        <Tile
          label="Active days"
          value={stats.active.of ? `${stats.active.yes}` : dash}
          delta={stats.activeDelta}
          deltaText={
            stats.activeDelta === undefined
              ? undefined
              : signed(stats.activeDelta, 0)
          }
          sub={
            stats.active.of
              ? `of ${stats.active.of} logged`
              : "lifting or cardio"
          }
        />
      </div>
    </section>
  );
}

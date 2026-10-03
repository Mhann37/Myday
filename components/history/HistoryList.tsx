"use client";

import { Check, Moon, Plus, Sun } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { buildDays, type DayRecord } from "@/lib/analytics";
import { summaryChips } from "@/lib/checkin";
import { useEntries, useNow } from "@/lib/client";
import { addDays, dateRange, formatDayMonth, formatWeekday, relativeDayLabel } from "@/lib/dates";
import { heatColor, heatText } from "@/lib/format";
import type { Entry, Period } from "@/lib/schema";
import { cn } from "../ui";

const PAGE = 30;

export function HistoryList() {
  const now = useNow();
  const { entries, error, refresh } = useEntries();
  const [span, setSpan] = useState(PAGE);
  const days = useMemo(() => (entries ? buildDays(entries) : []), [entries]);

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
          [0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface-2/60" />)
        )}
      </div>
    );
  }

  const { today } = now;
  const first = days[0]?.date ?? today;
  const from = addDays(today, -(span - 1));
  const rows = dateRange(from < first ? first : from, today).reverse();
  const byDate = new Map(days.map((d) => [d.date, d]));
  const entryMap = new Map<string, Entry>(entries.map((e) => [`${e.date}:${e.period}`, e]));
  const hasOlder = first < from;

  return (
    <div className="space-y-3 px-4">
      {entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-5 text-center text-ink-2">
          Nothing here yet. Your check-ins will appear as a day-by-day diary.
        </p>
      )}
      {rows.map((date) => (
        <DayRow key={date} date={date} today={today} day={byDate.get(date)} entryMap={entryMap} />
      ))}
      {hasOlder && (
        <button
          onClick={() => setSpan((s) => s + PAGE)}
          className="mx-auto block rounded-2xl border border-line bg-surface px-5 py-3 text-sm font-semibold text-ink-2 active:scale-95"
        >
          Show older
        </button>
      )}
    </div>
  );
}

function DayRow({ date, today, day, entryMap }: { date: string; today: string; day: DayRecord | undefined; entryMap: Map<string, Entry> }) {
  const am = entryMap.get(`${date}:morning`);
  const pm = entryMap.get(`${date}:night`);
  const chips = [
    ...(am ? summaryChips(am.data, "morning").filter((c) => c.includes("sleep")) : []),
    ...(pm ? summaryChips(pm.data, "night") : []),
  ].slice(0, 7);
  const empty = !am && !pm;
  const score = day?.wellbeing;

  return (
    <div className={cn("rounded-3xl border border-line bg-surface p-3.5", empty && "bg-transparent")}>
      <div className="flex items-center gap-3">
        <div className="w-12 shrink-0 text-center leading-tight">
          <div className="text-xs font-semibold uppercase text-muted">{formatWeekday(date)}</div>
          <div className="font-display text-2xl font-semibold">{formatDayMonth(date).split(" ")[0]}</div>
          <div className="text-xs text-muted">{formatDayMonth(date).split(" ")[1]}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <PeriodLink period="morning" date={date} entry={am} />
            <PeriodLink period="night" date={date} entry={pm} />
            {date === today && <span className="ml-auto text-xs font-semibold text-muted">{relativeDayLabel(date, today)}</span>}
          </div>
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-full bg-surface-2/70 px-2 py-0.5 text-xs font-medium text-ink-2">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {score !== undefined && (
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold"
            style={{ background: heatColor(score), color: heatText(score) }}
            title="Day score"
            aria-label={`Day score ${Math.round(score)}`}
          >
            {Math.round(score)}
          </div>
        )}
      </div>
    </div>
  );
}

function PeriodLink({ period, date, entry }: { period: Period; date: string; entry: Entry | undefined }) {
  const Icon = period === "morning" ? Sun : Moon;
  return (
    <Link
      href={`/checkin/${period}?date=${date}`}
      data-period={period}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold active:scale-95",
        entry ? "bg-accent text-on-accent" : "border border-dashed border-line text-muted",
      )}
      aria-label={`${entry ? "Edit" : "Add"} ${period} check-in`}
    >
      <Icon size={15} />
      {period === "morning" ? "AM" : "PM"}
      {entry ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
    </Link>
  );
}

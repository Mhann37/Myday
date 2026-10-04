"use client";

import {
  Baby,
  BedDouble,
  Bandage,
  Briefcase,
  CalendarDays,
  Check,
  ChevronLeft,
  Coffee,
  Dumbbell,
  Heart,
  Loader2,
  Moon,
  PenLine,
  Pill,
  Smile,
  Sun,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { carriedInjuries, progress, prune, QUESTIONS } from "@/lib/checkin";
import {
  BEHAVIOUR_FACES,
  CARDIO_TYPES,
  JUNK_LEVELS,
  KID_TAGS,
  KIDS,
  LIFT_FOCUS,
  MEDS,
  MOOD_FACES,
  WIFE_TAGS,
  WORK_TYPES,
} from "@/lib/config";
import {
  deleteEntry,
  saveEntry,
  setSaveNotice,
  useEntries,
  useNow,
} from "@/lib/client";
import { formatLong } from "@/lib/dates";
import { entryDataSchema, type EntryData, type Period } from "@/lib/schema";
import {
  useWorkspace,
  recordRevision,
  readDeviceDraft,
  saveDeviceDraft,
} from "@/lib/workspace-client";
import { QUICK_FIELDS } from "@/lib/preferences";
import { SyncStatus } from "../SyncStatus";
import { Injuries } from "./Injuries";
import { NetworkStatus } from "../NetworkStatus";
import {
  Chips,
  NumberField,
  Question,
  ScaleInput,
  Section,
  Segmented,
  Stepper,
  TextArea,
  YesNo,
  cn,
} from "../ui";

const draftKey = (date: string, period: Period) =>
  `myday:draft:${date}:${period}`;

function readDraft(date: string, period: Period): EntryData | null {
  try {
    if (localStorage.getItem("myday-offline-enabled")) return null;
    const raw = window.localStorage.getItem(draftKey(date, period));
    const parsed = raw ? entryDataSchema.safeParse(JSON.parse(raw)) : null;
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeDraft(date: string, period: Period, data: EntryData | null) {
  try {
    if (localStorage.getItem("myday-offline-enabled")) return true;
    if (data)
      window.localStorage.setItem(draftKey(date, period), JSON.stringify(data));
    else window.localStorage.removeItem(draftKey(date, period));
    return true;
  } catch {
    return false;
  }
}

export function CheckinForm({
  period,
  date: dateParam,
}: {
  period: Period;
  date?: string;
}) {
  const now = useNow();
  const { entries, error, refresh } = useEntries();
  const date = dateParam ?? now?.today;

  if (date && now && date > now.today)
    return (
      <Shell period={period} date={date}>
        <p role="alert" className="p-6 text-ink-2">
          This day hasn’t happened yet. Choose today or a previous day from
          History.
        </p>
      </Shell>
    );
  if (!date || !entries) {
    return (
      <Shell period={period} date={date}>
        <div className="space-y-4 px-4 pt-4" aria-busy="true">
          {error ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <p className="mb-3 text-bad">{error}</p>
              <button
                onClick={() => void refresh()}
                className="rounded-xl bg-accent px-4 py-2 font-semibold text-on-accent"
              >
                Try again
              </button>
            </div>
          ) : (
            [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-3xl bg-surface-2/60"
              />
            ))
          )}
        </div>
      </Shell>
    );
  }

  return (
    <PreparedForm
      key={`${dateParam ?? "current"}:${period}`}
      period={period}
      date={date}
      maxDate={now?.today ?? date}
      entries={entries}
    />
  );
}

function PreparedForm({
  period,
  date: initialDate,
  maxDate,
  entries,
}: {
  period: Period;
  date: string;
  maxDate: string;
  entries: import("@/lib/schema").Entry[];
}) {
  // An open check-in keeps its original day even when the live clock rolls over at 4am.
  const [date] = useState(initialDate);
  const existing = entries.find((e) => e.date === date && e.period === period);
  return (
    <FormBody
      key={`${date}:${period}`}
      period={period}
      date={date}
      maxDate={maxDate}
      existing={existing?.data}
      carried={carriedInjuries(entries, date, period)}
    />
  );
}

function Shell({
  period,
  date,
  children,
  right,
}: {
  period: Period;
  date?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  const router = useRouter();
  const Icon = period === "morning" ? Sun : Moon;
  return (
    <div data-period={period} className="mx-auto min-h-dvh max-w-xl">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Back"
            onClick={() => router.back()}
            className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-ink-2 active:bg-surface-2"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display flex items-center gap-2 text-2xl font-semibold leading-tight">
              <Icon size={22} className="text-accent" />
              {period === "morning" ? "Morning check-in" : "Night check-in"}
            </h1>
            <div className="truncate text-sm text-muted">
              {date ? formatLong(date) : " "}
            </div>
          </div>
          {right}
        </div>
      </header>
      <NetworkStatus />
      <SyncStatus />
      {children}
    </div>
  );
}

function FormBody({
  period,
  date,
  maxDate,
  existing,
  carried,
}: {
  period: Period;
  date: string;
  maxDate: string;
  existing: EntryData | undefined;
  carried: EntryData["injuries"];
}) {
  const router = useRouter();
  const workspace = useWorkspace();
  const WIFE_NAME = workspace.preferences.partnerName;
  const family = KIDS.map((k) => ({
    ...k,
    name: workspace.preferences.childNames[k.key] ?? k.name,
  }));
  const baseRevision = useRef(recordRevision(`entry:${date}:${period}`));
  const touched = useRef(false);
  const [full, setFull] = useState(false);
  const [draftStatus, setDraftStatus] = useState(
    readDraft(date, period) ? "Draft restored from this device" : "",
  );

  const [data, setData] = useState<EntryData>(() => {
    const draft = readDraft(date, period);
    if (draft) return draft;
    if (existing) return structuredClone(existing);
    return carried !== undefined ? { injuries: carried } : {};
  });
  useEffect(() => {
    if (!workspace.enabled || !workspace.unlocked) return;
    let live = true;
    void readDeviceDraft(`${date}:${period}`)
      .then((draft) => {
        if (!live || !draft || touched.current) return;
        const parsed = entryDataSchema.safeParse(draft.data);
        if (parsed.success) {
          setData(parsed.data);
          baseRevision.current = draft.expected;
          setDraftStatus("Encrypted draft restored from this device");
        }
      })
      .catch(() => {
        if (live) setDraftStatus("Could not restore the device draft.");
      });
    return () => {
      live = false;
    };
  }, [date, period, workspace.enabled, workspace.unlocked]);
  const injuriesCarried = useMemo(
    () => !existing && !readDraft(date, period) && carried !== undefined,
    [existing, carried, date, period],
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const update = (patch: Partial<EntryData>) => {
    touched.current = true;
    const next = { ...data, ...patch };
    const stored = writeDraft(date, period, next);
    setDraftStatus(
      stored
        ? workspace.enabled
          ? "Draft kept in this open check-in. Save to keep it on device."
          : "Draft saved on this device"
        : "Device storage unavailable. Keep this page open until you save.",
    );
    setData(next);
    if (workspace.enabled) {
      void saveDeviceDraft(`${date}:${period}`, next, baseRevision.current)
        .then(() => setDraftStatus("Encrypted draft saved on this device"))
        .catch(() =>
          setDraftStatus(
            "Draft kept in this open check-in. Unlock device storage to keep it.",
          ),
        );
    }
  };

  // section helpers: merge one field into a nested object
  const sec = <K extends keyof EntryData>(
    key: K,
    patch: Partial<NonNullable<EntryData[K]>>,
  ) =>
    update({
      [key]: { ...(data[key] as object | undefined), ...patch },
    } as Partial<EntryData>);

  const quickIds = workspace.preferences[period];
  const quickQuestions = QUESTIONS[period].filter((q) =>
    quickIds.includes(q.id as never),
  );
  const { answered, total } = full
    ? progress(period, data)
    : {
        answered: quickQuestions.filter((q) => q.done(data)).length,
        total: quickQuestions.length,
      };

  const onSave = async () => {
    const parsed = entryDataSchema.safeParse(prune(data));
    if (!parsed.success) {
      setSaveError(
        "Some answers are outside the supported range. Check your values and try again.",
      );
      return;
    }
    if (
      !Object.keys(prune(data)).length ||
      (!touched.current &&
        !existing &&
        injuriesCarried &&
        Object.keys(prune(data)).length === 1)
    ) {
      setSaveError(
        "Add at least one answer before saving. You can skip the rest.",
      );
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveEntry(date, period, parsed.data, baseRevision.current);
      writeDraft(date, period, null);
      if (workspace.enabled)
        await saveDeviceDraft(`${date}:${period}`, null, baseRevision.current);
      setSaveNotice(
        workspace.enabled
          ? `${period === "morning" ? "Morning" : "Night"} check-in saved on this device. Sync status shows when it reaches your database.`
          : `${period === "morning" ? "Morning" : "Night"} check-in saved. One more day of understanding you.`,
      );
      if (!navigator.onLine) {
        setSaving(false);
        setDraftStatus("Saved on this device. Reconnect to sync.");
        return;
      }
      router.push("/");
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Couldn't save. Check your connection and try again.",
      );
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this check-in? This can't be undone.")) return;
    setSaving(true);
    try {
      await deleteEntry(date, period, baseRevision.current);
      writeDraft(date, period, null);
      if (workspace.enabled)
        await saveDeviceDraft(`${date}:${period}`, null, baseRevision.current);
      if (!navigator.onLine) {
        setSaving(false);
        setDraftStatus("Saved on this device. Reconnect to sync.");
        return;
      }
      router.push("/");
    } catch {
      setSaveError("Couldn't delete. Try again.");
      setSaving(false);
    }
  };

  const changeDate = (value: string) => {
    if (value && value <= maxDate)
      router.replace(`/checkin/${period}?date=${value}`);
  };

  const wifeSection = (
    <>
      <Question label={`How is ${WIFE_NAME.toLowerCase()} feeling?`}>
        <ScaleInput
          ariaLabel={`${WIFE_NAME} mood`}
          faces={MOOD_FACES}
          value={data.wife?.mood}
          onChange={(v) => sec("wife", { mood: v })}
          lowLabel="Low"
          highLabel="Great"
        />
      </Question>
      <Question label="Anything going on?" aside="pick any">
        <Chips
          options={WIFE_TAGS}
          value={data.wife?.tags}
          onChange={(v) => sec("wife", { tags: v })}
          noneLabel="Nothing"
        />
      </Question>
    </>
  );

  const meSection = (
    <Section
      title={
        period === "morning" ? "How you're waking up" : "How you're feeling"
      }
      icon={<Smile size={20} />}
    >
      <Question label="Mood">
        <ScaleInput
          ariaLabel="Mood"
          faces={MOOD_FACES}
          value={data.me?.mood}
          onChange={(v) => sec("me", { mood: v })}
          lowLabel="Low"
          highLabel="Great"
        />
      </Question>
      <Question label="Energy">
        <ScaleInput
          ariaLabel="Energy"
          value={data.me?.energy}
          onChange={(v) => sec("me", { energy: v })}
          lowLabel="Drained"
          highLabel="Charged"
        />
      </Question>
      <Question label="Stress">
        <ScaleInput
          ariaLabel="Stress"
          value={data.me?.stress}
          onChange={(v) => sec("me", { stress: v })}
          lowLabel="Calm"
          highLabel="Maxed out"
        />
      </Question>
    </Section>
  );

  const injurySection = (
    <Section
      title="Body"
      icon={<Bandage size={20} />}
      hint="Any injuries or niggles right now?"
    >
      <Injuries
        value={data.injuries}
        onChange={(v) => update({ injuries: v })}
        carried={injuriesCarried}
      />
    </Section>
  );

  const notesSection = (
    <Section title="Notes" icon={<PenLine size={20} />}>
      <TextArea
        ariaLabel="Notes"
        rows={3}
        maxLength={2000}
        placeholder={
          period === "morning"
            ? "Anything on your mind for today?"
            : "Anything else worth remembering?"
        }
        value={data.notes}
        onChange={(v) => update({ notes: v })}
      />
    </Section>
  );

  return (
    <Shell
      period={period}
      date={date}
      right={
        <label
          className="relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full bg-surface-2/70 text-ink-2 active:scale-95"
          title="Change day"
        >
          <CalendarDays size={20} aria-hidden />
          <input
            type="date"
            aria-label="Choose the day for this check-in"
            value={date}
            max={maxDate}
            onChange={(e) => changeDate(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      }
    >
      <div className="px-4 pt-3">
        <div
          className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-surface-2/60 p-1.5"
          aria-label="Check-in detail"
        >
          <button
            type="button"
            aria-pressed={!full}
            onClick={() => setFull(false)}
            className={cn(
              "min-h-11 rounded-xl text-sm font-semibold",
              !full ? "bg-surface text-accent shadow-sm" : "text-ink-2",
            )}
          >
            Quick check-in
          </button>
          <button
            type="button"
            aria-pressed={full}
            onClick={() => setFull(true)}
            className={cn(
              "min-h-11 rounded-xl text-sm font-semibold",
              full ? "bg-surface text-accent shadow-sm" : "text-ink-2",
            )}
          >
            Full diary
          </button>
        </div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>
            {answered} of {total} answered
          </span>
          <span>Skip anything that doesn&apos;t apply</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Check-in answers completed"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answered}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${(answered / total) * 100}%` }}
          />
        </div>
      </div>

      <main className="space-y-4 px-4 pb-44 pt-4" aria-label="Check-in answers">
        {!full ? (
          <QuickFields
            ids={quickIds}
            data={data}
            update={update}
            period={period}
          />
        ) : period === "morning" ? (
          <>
            <Section title="Sleep" icon={<BedDouble size={20} />}>
              <Question label="Hours slept">
                <Stepper
                  ariaLabel="Hours slept"
                  value={data.sleep?.hours}
                  onChange={(v) => sec("sleep", { hours: v })}
                  step={0.5}
                  min={0}
                  max={14}
                  start={7}
                  unit="hours"
                />
              </Question>
              <Question label="Sleep quality">
                <ScaleInput
                  ariaLabel="Sleep quality"
                  value={data.sleep?.quality}
                  onChange={(v) => sec("sleep", { quality: v })}
                  lowLabel="Awful"
                  highLabel="Brilliant"
                />
              </Question>
            </Section>
            {meSection}
            {full && (
              <>
                <Section title={WIFE_NAME} icon={<Heart size={20} />}>
                  {wifeSection}
                </Section>
                {injurySection}
                {notesSection}
              </>
            )}
          </>
        ) : (
          <>
            {meSection}
            {!full && (
              <>
                <Section
                  title="Movement & daily habits"
                  icon={<Dumbbell size={20} />}
                  hint="An honest record matters more than a perfect day."
                >
                  <Question label="Lifted weights?">
                    <YesNo
                      ariaLabel="Lifted weights"
                      value={data.training?.lifted}
                      onChange={(v) =>
                        sec("training", {
                          lifted: v,
                          liftFocus: v ? data.training?.liftFocus : undefined,
                        })
                      }
                    />
                  </Question>
                  <Question label="Did cardio?">
                    <YesNo
                      ariaLabel="Did cardio"
                      value={data.training?.cardio}
                      onChange={(v) =>
                        sec("training", {
                          cardio: v,
                          cardioMins: v ? data.training?.cardioMins : undefined,
                          cardioTypes: v
                            ? data.training?.cardioTypes
                            : undefined,
                        })
                      }
                    />
                  </Question>
                  <Question label="Water">
                    <Stepper
                      ariaLabel="Glasses of water"
                      value={data.habits?.water}
                      onChange={(v) => sec("habits", { water: v })}
                      max={40}
                      unit="glasses"
                      start={0}
                    />
                  </Question>
                  <Question label="Alcoholic drinks">
                    <Stepper
                      ariaLabel="Alcoholic drinks"
                      value={data.habits?.alcohol}
                      onChange={(v) => sec("habits", { alcohol: v })}
                      max={60}
                      unit="drinks"
                      start={0}
                    />
                  </Question>
                  <Question label="Time outside">
                    <Stepper
                      ariaLabel="Minutes outside"
                      value={data.habits?.outdoorMins}
                      onChange={(v) => sec("habits", { outdoorMins: v })}
                      step={10}
                      max={1440}
                      unit="min"
                      start={0}
                    />
                  </Question>
                </Section>
                <Section
                  title="One small win"
                  icon={<PenLine size={20} />}
                  hint="Optional. A moment worth keeping."
                >
                  <TextArea
                    ariaLabel="One win"
                    placeholder="What went well today?"
                    value={data.mind?.win}
                    onChange={(v) => sec("mind", { win: v })}
                  />
                </Section>
              </>
            )}
            {full && (
              <>
                <Section title="Work" icon={<Briefcase size={20} />}>
                  <Question label="Did you work today?">
                    <Segmented
                      ariaLabel="Work"
                      options={WORK_TYPES}
                      value={data.work?.type}
                      onChange={(v) =>
                        sec("work", {
                          type: v,
                          hours: v === "none" ? undefined : data.work?.hours,
                        })
                      }
                    />
                  </Question>
                  {data.work?.type && data.work.type !== "none" && (
                    <Question label="Hours worked">
                      <Stepper
                        ariaLabel="Hours worked"
                        value={data.work.hours}
                        onChange={(v) => sec("work", { hours: v })}
                        step={0.5}
                        max={18}
                        start={8}
                        unit="hours"
                      />
                    </Question>
                  )}
                </Section>

                <Section title="Training" icon={<Dumbbell size={20} />}>
                  <Question label="Lifted weights?">
                    <YesNo
                      ariaLabel="Lifted weights"
                      value={data.training?.lifted}
                      onChange={(v) =>
                        sec("training", {
                          lifted: v,
                          liftFocus: v ? data.training?.liftFocus : undefined,
                        })
                      }
                    />
                  </Question>
                  {data.training?.lifted && (
                    <Question label="Session" aside="optional">
                      <Chips
                        size="sm"
                        options={LIFT_FOCUS}
                        value={data.training.liftFocus}
                        onChange={(v) => sec("training", { liftFocus: v })}
                      />
                    </Question>
                  )}
                  <Question label="Did cardio?">
                    <YesNo
                      ariaLabel="Did cardio"
                      value={data.training?.cardio}
                      onChange={(v) =>
                        sec("training", {
                          cardio: v,
                          cardioTypes: v
                            ? data.training?.cardioTypes
                            : undefined,
                          cardioMins: v ? data.training?.cardioMins : undefined,
                        })
                      }
                    />
                  </Question>
                  {data.training?.cardio && (
                    <>
                      <Question label="Type" aside="optional">
                        <Chips
                          size="sm"
                          options={CARDIO_TYPES}
                          value={data.training.cardioTypes}
                          onChange={(v) => sec("training", { cardioTypes: v })}
                        />
                      </Question>
                      <Question label="Duration">
                        <Stepper
                          ariaLabel="Cardio minutes"
                          value={data.training.cardioMins}
                          onChange={(v) => sec("training", { cardioMins: v })}
                          step={5}
                          max={300}
                          start={30}
                          unit="min"
                        />
                      </Question>
                    </>
                  )}
                </Section>

                <Section title={WIFE_NAME} icon={<Heart size={20} />}>
                  {wifeSection}
                  <Question label="Quality time together today?">
                    <YesNo
                      ariaLabel="Quality time"
                      value={data.mind?.wifeTime}
                      onChange={(v) => sec("mind", { wifeTime: v })}
                    />
                  </Question>
                </Section>

                <Section
                  title="The kids"
                  icon={<Baby size={20} />}
                  hint="How was their behaviour today?"
                >
                  {family.map((kid) => (
                    <div
                      key={kid.key}
                      className="rounded-2xl border border-line bg-surface-2/40 p-3"
                    >
                      <div className="mb-2 font-display text-lg font-semibold">
                        {kid.name}
                      </div>
                      <ScaleInput
                        ariaLabel={`${kid.name} behaviour`}
                        faces={BEHAVIOUR_FACES}
                        value={data.kids?.[kid.key]?.behaviour}
                        onChange={(v) =>
                          update({
                            kids: {
                              ...data.kids,
                              [kid.key]: {
                                ...data.kids?.[kid.key],
                                behaviour: v,
                              },
                            },
                          })
                        }
                        lowLabel="Rough"
                        highLabel="Angel"
                      />
                      <div className="mt-3">
                        <Chips
                          size="sm"
                          options={KID_TAGS}
                          value={data.kids?.[kid.key]?.tags}
                          onChange={(v) =>
                            update({
                              kids: {
                                ...data.kids,
                                [kid.key]: { ...data.kids?.[kid.key], tags: v },
                              },
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                  <Question label="One-on-one time with…" aside="pick any">
                    <Chips
                      options={family.map((k) => ({
                        key: k.key,
                        label: k.name,
                      }))}
                      value={data.mind?.oneOnOne}
                      onChange={(v) => sec("mind", { oneOnOne: v })}
                      noneLabel="No one"
                    />
                  </Question>
                </Section>

                {injurySection}

                <Section
                  title="Medication"
                  icon={<Pill size={20} />}
                  hint="Anything taken today?"
                >
                  <Chips
                    options={MEDS}
                    value={data.meds?.taken}
                    onChange={(v) =>
                      sec("meds", {
                        taken: v,
                        other: v?.includes("other")
                          ? data.meds?.other
                          : undefined,
                        weightLossNote: v?.includes("weightloss")
                          ? data.meds?.weightLossNote
                          : undefined,
                      })
                    }
                    noneLabel="None today"
                  />
                  {data.meds?.taken?.includes("weightloss") && (
                    <input
                      aria-label="Weight-loss medication note"
                      placeholder="Dose or note (optional)"
                      value={data.meds.weightLossNote ?? ""}
                      maxLength={160}
                      onChange={(e) =>
                        sec("meds", {
                          weightLossNote: e.target.value || undefined,
                        })
                      }
                      className="h-12 w-full rounded-2xl border border-line bg-surface-2/60 px-4 text-ink placeholder:text-muted"
                    />
                  )}
                  {data.meds?.taken?.includes("other") && (
                    <input
                      aria-label="Other medication"
                      placeholder="What did you take?"
                      value={data.meds.other ?? ""}
                      maxLength={160}
                      onChange={(e) =>
                        sec("meds", { other: e.target.value || undefined })
                      }
                      className="h-12 w-full rounded-2xl border border-line bg-surface-2/60 px-4 text-ink placeholder:text-muted"
                    />
                  )}
                </Section>

                <Section title="Daily habits" icon={<Coffee size={20} />}>
                  <div className="grid grid-cols-1 gap-5">
                    <Question label="Alcoholic drinks">
                      <Stepper
                        ariaLabel="Alcoholic drinks"
                        value={data.habits?.alcohol}
                        onChange={(v) => sec("habits", { alcohol: v })}
                        max={40}
                        start={0}
                        unit="drinks"
                      />
                    </Question>
                    <Question label="Caffeinated drinks">
                      <Stepper
                        ariaLabel="Caffeinated drinks"
                        value={data.habits?.caffeine}
                        onChange={(v) => sec("habits", { caffeine: v })}
                        max={20}
                        start={0}
                        unit="cups"
                      />
                    </Question>
                    <Question label="Water" aside="glasses">
                      <Stepper
                        ariaLabel="Glasses of water"
                        value={data.habits?.water}
                        onChange={(v) => sec("habits", { water: v })}
                        max={30}
                        start={0}
                        unit="glasses"
                      />
                    </Question>
                    <Question label="Sugary / junk food">
                      <Segmented
                        ariaLabel="Junk food"
                        options={JUNK_LEVELS.map((label, i) => ({
                          key: String(i),
                          label,
                        }))}
                        value={
                          data.habits?.junk === undefined
                            ? undefined
                            : String(data.habits.junk)
                        }
                        onChange={(v) =>
                          sec("habits", {
                            junk: v === undefined ? undefined : Number(v),
                          })
                        }
                      />
                    </Question>
                    <Question label="Steps">
                      <NumberField
                        ariaLabel="Steps"
                        placeholder="e.g. 8,500"
                        max={100000}
                        value={data.habits?.steps}
                        onChange={(v) => sec("habits", { steps: v })}
                      />
                    </Question>
                    <Question label="Time outside">
                      <Stepper
                        ariaLabel="Minutes outside"
                        value={data.habits?.outdoorMins}
                        onChange={(v) => sec("habits", { outdoorMins: v })}
                        step={15}
                        max={600}
                        start={30}
                        unit="min"
                      />
                    </Question>
                    <Question label="Screen time (not work)">
                      <Stepper
                        ariaLabel="Screen hours"
                        value={data.mind?.screenHours}
                        onChange={(v) => sec("mind", { screenHours: v })}
                        step={0.5}
                        max={16}
                        start={2}
                        unit="hours"
                      />
                    </Question>
                  </div>
                </Section>

                <Section title="Reflection" icon={<PenLine size={20} />}>
                  <Question label="One win from today" aside="optional">
                    <TextArea
                      ariaLabel="One win"
                      placeholder="Something that went well"
                      value={data.mind?.win}
                      onChange={(v) => sec("mind", { win: v })}
                    />
                  </Question>
                  <Question label="Grateful for" aside="optional">
                    <TextArea
                      ariaLabel="Gratitude"
                      placeholder="Someone or something"
                      value={data.mind?.gratitude}
                      onChange={(v) => sec("mind", { gratitude: v })}
                    />
                  </Question>
                  <Question label="Notes" aside="optional">
                    <TextArea
                      ariaLabel="Notes"
                      rows={3}
                      maxLength={2000}
                      placeholder="Anything else worth remembering?"
                      value={data.notes}
                      onChange={(v) => update({ notes: v })}
                    />
                  </Question>
                </Section>
              </>
            )}
          </>
        )}

        {existing && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="mx-auto flex items-center gap-2 py-3 text-sm text-muted active:text-bad"
          >
            <Trash2 size={16} /> Delete this check-in
          </button>
        )}
      </main>

      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 px-4 pt-3 backdrop-blur-md">
        <div className="mx-auto max-w-xl">
          {draftStatus && (
            <p role="status" className="mb-2 text-center text-xs text-ink-2">
              {draftStatus}
            </p>
          )}
          {saveError && (
            <p role="alert" className="mb-2 text-center text-sm text-bad">
              {saveError}
            </p>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className={cn(
              "flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-lg font-semibold text-on-accent shadow-lg transition active:scale-[0.98] disabled:opacity-70",
            )}
          >
            {saving ? (
              <Loader2 className="animate-spin" size={22} />
            ) : (
              <Check size={22} />
            )}
            {existing
              ? "Update check-in"
              : period === "morning"
                ? "Save morning check-in"
                : "Save night check-in"}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function QuickFields({
  ids,
  data,
  update,
  period,
}: {
  ids: readonly string[];
  data: EntryData;
  update: (d: Partial<EntryData>) => void;
  period: Period;
}) {
  const sec = <K extends keyof EntryData>(
    key: K,
    patch: Partial<NonNullable<EntryData[K]>>,
  ) => update({ [key]: { ...((data[key] as object) ?? {}), ...patch } });
  return (
    <Section
      title="Your quick check-in"
      icon={<Smile size={20} />}
      hint="Your questions. Skip anything you don't want to record."
    >
      {ids.map((id) => (
        <Question
          key={id}
          label={QUICK_FIELDS[id as keyof typeof QUICK_FIELDS]}
        >
          {id === "mood" || id === "energy" || id === "stress" ? (
            <ScaleInput
              ariaLabel={QUICK_FIELDS[id]}
              faces={id === "mood" ? MOOD_FACES : undefined}
              value={data.me?.[id]}
              onChange={(v) => sec("me", { [id]: v })}
              lowLabel={
                id === "stress" ? "Calm" : id === "energy" ? "Drained" : "Low"
              }
              highLabel={
                id === "stress"
                  ? "Maxed out"
                  : id === "energy"
                    ? "Charged"
                    : "Great"
              }
            />
          ) : id === "sleepQuality" ? (
            <ScaleInput
              ariaLabel="Sleep quality"
              value={data.sleep?.quality}
              onChange={(v) => sec("sleep", { quality: v })}
              lowLabel="Awful"
              highLabel="Brilliant"
            />
          ) : id === "sleepHours" ? (
            <Stepper
              ariaLabel="Hours slept"
              value={data.sleep?.hours}
              onChange={(v) => sec("sleep", { hours: v })}
              step={0.5}
              min={0}
              max={24}
              start={7}
              unit="hours"
            />
          ) : id === "lifted" || id === "cardio" ? (
            <YesNo
              ariaLabel={id === "lifted" ? "Lifted weights" : "Did cardio"}
              value={data.training?.[id]}
              onChange={(v) => sec("training", { [id]: v })}
            />
          ) : id === "water" ? (
            <Stepper
              ariaLabel="Glasses of water"
              value={data.habits?.water}
              onChange={(v) => sec("habits", { water: v })}
              max={40}
              unit="glasses"
            />
          ) : id === "alcohol" ? (
            <Stepper
              ariaLabel="Alcohol drinks"
              value={data.habits?.alcohol}
              onChange={(v) => sec("habits", { alcohol: v })}
              max={60}
              unit="drinks"
            />
          ) : (
            <Stepper
              ariaLabel="Minutes outside"
              value={data.habits?.outdoorMins}
              onChange={(v) => sec("habits", { outdoorMins: v })}
              step={15}
              max={1440}
              start={30}
              unit="min"
            />
          )}
        </Question>
      ))}
      {period === "night" && (
        <Question label="One win from today" aside="optional">
          <TextArea
            ariaLabel="One win"
            placeholder="Something that went well"
            value={data.mind?.win}
            onChange={(v) => sec("mind", { win: v })}
          />
        </Question>
      )}
    </Section>
  );
}

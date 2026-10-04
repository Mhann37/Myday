"use client";
import { useState } from "react";
import { useWorkspace, change, recordRevision } from "@/lib/workspace-client";
import { useNow } from "@/lib/client";
import { buildDays } from "@/lib/analytics";
import { addDays, formatDayMonth } from "@/lib/dates";
import {
  experimentSchema,
  experimentSummary,
  type Experiment,
} from "@/lib/experiments";
import { OUTCOMES } from "@/lib/preferences";
import { Card } from "../ui";
const input = "mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3";
export function Experiments() {
  const s = useWorkspace(),
    now = useNow(),
    [creating, setCreating] = useState(false),
    [showPast, setShowPast] = useState(false);
  if (!s.data || !now) return null;
  const active = s.experiments
      .filter((e) => !e.decision)
      .sort((a, b) => a.reviewDate.localeCompare(b.reviewDate)),
    past = s.experiments
      .filter((e) => e.decision)
      .sort((a, b) => b.start.localeCompare(a.start));
  return (
    <Card>
      <p className="eyebrow">ONE CHANGE. A CHANCE TO LEARN.</p>
      <h2 className="font-display mt-2 text-2xl font-semibold">
        Your next adjustment
      </h2>
      <p className="mt-2 text-sm text-ink-2">
        Choose a small action and an outcome. Revisit it after enough time to
        see what you recorded.
      </p>
      {active.map((e) => (
        <ExperimentCard key={e.id} experiment={e} />
      ))}
      {creating ? (
        <ExperimentForm today={now.today} onClose={() => setCreating(false)} />
      ) : (
        <button
          className="primary-button mt-4"
          onClick={() => setCreating(true)}
        >
          {active.length ? "Plan another adjustment" : "Plan one adjustment"}
        </button>
      )}
      {past.length > 0 && (
        <>
          <button
            className="secondary-button mt-3 ml-2 text-sm"
            onClick={() => setShowPast(!showPast)}
          >
            {showPast ? "Hide" : "Show"} past reviews ({past.length})
          </button>
          {showPast &&
            past.map((e) => <ExperimentCard key={e.id} experiment={e} />)}
        </>
      )}
    </Card>
  );
}
function ExperimentForm({
  today,
  onClose,
}: {
  today: string;
  onClose: () => void;
}) {
  const s = useWorkspace(),
    [draft, setDraft] = useState<Experiment>({
      id: crypto.randomUUID(),
      action: "",
      habitId: null,
      outcome: s.preferences.outcomes[0],
      start: today,
      reviewDate: addDays(today, 14),
      baselineFrom: addDays(today, -14),
      decision: null,
      reflection: "",
      reviewedAt: null,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="mt-4 space-y-3 rounded-2xl bg-surface-2/60 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsed = experimentSchema.safeParse(draft);
        if (!parsed.success) {
          setError(
            "Choose an action and a review date after the start, within 90 days.",
          );
          return;
        }
        setBusy(true);
        try {
          await change({
            kind: "experiment",
            key: `experiment:${draft.id}`,
            id: crypto.randomUUID(),
            expected: null,
            data: parsed.data,
          });
          onClose();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm font-semibold">
        One action to try
        <textarea
          autoFocus
          required
          maxLength={240}
          className="mt-1 min-h-20 w-full rounded-xl border border-line bg-surface p-3"
          placeholder="After lunch, walk outside on four days each week"
          value={draft.action}
          onChange={(e) => setDraft({ ...draft, action: e.target.value })}
        />
      </label>
      <label className="block text-sm font-semibold">
        Link a habit
        <select
          className={input}
          value={draft.habitId ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, habitId: e.target.value || null })
          }
        >
          <option value="">No linked habit</option>
          {s.data?.habitData.habits
            .filter((h) => !h.archived)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
        </select>
      </label>
      <label className="block text-sm font-semibold">
        Outcome to observe
        <select
          className={input}
          value={draft.outcome}
          onChange={(e) =>
            setDraft({
              ...draft,
              outcome: e.target.value as Experiment["outcome"],
            })
          }
        >
          {Object.entries(OUTCOMES).map(([id, o]) => (
            <option key={id} value={id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Start
          <input
            required
            type="date"
            className={input}
            min={today}
            value={draft.start}
            onChange={(e) =>
              setDraft({
                ...draft,
                start: e.target.value,
                baselineFrom: addDays(e.target.value, -14),
              })
            }
          />
        </label>
        <label className="text-sm">
          Review on
          <input
            required
            type="date"
            className={input}
            min={addDays(draft.start, 1)}
            max={addDays(draft.start, 90)}
            value={draft.reviewDate}
            onChange={(e) => setDraft({ ...draft, reviewDate: e.target.value })}
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        The 14 days before the start form your baseline. Record this outcome in
        your check-ins. A week may be too short to learn much.
      </p>
      <div className="flex gap-2">
        <button disabled={busy} className="primary-button">
          Save adjustment
        </button>
        <button
          disabled={busy}
          type="button"
          onClick={onClose}
          className="secondary-button"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
function ExperimentCard({ experiment: e }: { experiment: Experiment }) {
  const s = useWorkspace(),
    now = useNow(),
    [reflection, setReflection] = useState(e.reflection),
    [reviewDate, setReviewDate] = useState(e.reviewDate),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!s.data || !now) return null;
  const stats = experimentSummary(
      e,
      buildDays(s.data.entries),
      s.data.habitData,
      now.today,
    ),
    o = OUTCOMES[e.outcome],
    due = now.today >= e.reviewDate;
  const save = async (patch: Partial<Experiment>) => {
    setBusy(true);
    try {
      await change({
        kind: "experiment",
        key: `experiment:${e.id}`,
        id: crypto.randomUUID(),
        expected: recordRevision(`experiment:${e.id}`),
        data: { ...e, ...patch },
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="mt-4 rounded-2xl border border-line p-4"
      aria-label={e.action}
    >
      <p className="text-xs font-semibold text-accent">
        {e.decision
          ? `Reviewed · ${e.decision}`
          : due
            ? "Ready to review"
            : `Review ${formatDayMonth(e.reviewDate)}`}
      </p>
      <h3 className="mt-2 font-semibold">{e.action}</h3>
      <p className="mt-1 text-xs text-muted">
        {formatDayMonth(e.start)} – {formatDayMonth(e.reviewDate)} · observing{" "}
        {o.label.toLowerCase()}
      </p>
      {e.habitId && (
        <p className="mt-3 text-sm text-ink-2">
          {stats.completed}/{stats.eligible} eligible days achieved ·{" "}
          {stats.logged} recorded. Weekly habits can have fewer goal days than
          eligible opportunities.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-muted">Before</p>
          <p className="mt-1 font-semibold">
            {stats.before.mean?.toFixed(1) ?? "—"} {o.unit}
          </p>
          <p className="text-xs text-muted">{stats.before.n} measured days</p>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <p className="text-xs text-muted">During</p>
          <p className="mt-1 font-semibold">
            {stats.after.mean?.toFixed(1) ?? "—"} {o.unit}
          </p>
          <p className="text-xs text-muted">{stats.after.n} measured days</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-2">
        {stats.delta === undefined
          ? "Not enough evidence for a comparison: record at least five outcome days in each period."
          : `${o.label} averaged ${Math.abs(stats.delta).toFixed(1)} ${o.unit === "hours" ? "hours" : "points"} ${stats.delta >= 0 ? "higher" : "lower"}. This describes the recorded periods; other changes and selective logging may explain the difference.`}
      </p>
      {e.decision ? (
        <p className="mt-3 text-sm text-ink-2">
          {e.reflection || "Decision saved for your next review."}
        </p>
      ) : (
        <>
          {due && (
            <>
              <label className="mt-3 block text-sm font-semibold">
                What did you notice?
                <textarea
                  maxLength={600}
                  className="mt-1 min-h-20 w-full rounded-xl border border-line bg-surface p-3"
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {(["continue", "simplify", "change"] as const).map((d) => (
                  <button
                    disabled={busy}
                    className="secondary-button text-sm"
                    key={d}
                    onClick={() =>
                      void save({
                        decision: d,
                        reflection,
                        reviewedAt: new Date().toISOString(),
                      })
                    }
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </>
          )}
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer text-ink-2">
              Give it more time
            </summary>
            <input
              aria-label="New review date"
              type="date"
              className={input}
              min={addDays(now.today, 1)}
              max={addDays(e.start, 90)}
              value={reviewDate}
              onChange={(event) => setReviewDate(event.target.value)}
            />
            <button
              disabled={busy}
              className="secondary-button mt-2"
              onClick={() => void save({ reviewDate })}
            >
              Move review date
            </button>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

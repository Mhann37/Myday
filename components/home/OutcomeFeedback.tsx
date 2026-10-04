"use client";
import Link from "next/link";
import { useWorkspace, change, recordRevision } from "@/lib/workspace-client";
import { useNow } from "@/lib/client";
import { buildDays } from "@/lib/analytics";
import { measuredOutcome } from "@/lib/experiments";
import { OUTCOMES } from "@/lib/preferences";
import { addDays } from "@/lib/dates";
import { Card } from "../ui";
import { useState } from "react";
export function OutcomeFeedback() {
  const s = useWorkspace(),
    now = useNow(),
    [error, setError] = useState("");
  if (!s.data || !now) return null;
  const days = buildDays(s.data.entries),
    to = addDays(now.today, -1),
    from = addDays(to, -6);
  return (
    <Card>
      <p className="eyebrow">WHAT MATTERS TO YOU</p>
      <h2 className="font-display mt-2 text-2xl font-semibold">
        Your outcomes
      </h2>
      <div className="mt-4 space-y-4">
        {s.preferences.outcomes.map((outcome) => {
          const o = OUTCOMES[outcome],
            current = measuredOutcome(days, outcome, from, to),
            previous = measuredOutcome(
              days,
              outcome,
              addDays(from, -7),
              addDays(from, -1),
            ),
            id = `outcome:${outcome}:${to}`,
            dismissed = s.preferences.dismissed.includes(id),
            delta =
              current.n >= 3 && previous.n >= 3
                ? current.mean! - previous.mean!
                : undefined;
          return (
            <div key={outcome}>
              <div className="flex justify-between gap-2">
                <h3 className="font-semibold">{o.label}</h3>
                <span className="font-semibold">
                  {current.mean?.toFixed(1) ?? "—"}{" "}
                  <span className="text-xs font-normal text-muted">
                    {o.unit}
                  </span>
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">
                Last 7 complete days · {current.n}/7 measured
              </p>
              {!dismissed && (
                <>
                  <p className="mt-2 text-sm text-ink-2">
                    {delta === undefined
                      ? `Record ${o.label.toLowerCase()} in your check-ins to build a useful baseline. At least three measured days in each week are needed for this summary.`
                      : `Your average was ${Math.abs(delta).toFixed(1)} ${o.unit === "hours" ? "hours" : "points"} ${delta >= 0 ? "higher" : "lower"} than the previous week (${previous.n} measured days). ${current.n < 7 || previous.n < 7 ? "Unrecorded days could change this picture." : "Look at the surrounding context before choosing an adjustment."}`}
                  </p>
                  {delta !== undefined && (
                    <button
                      className="min-h-11 text-xs text-accent"
                      onClick={async () => {
                        try {
                          await change({
                            kind: "preferences",
                            id: crypto.randomUUID(),
                            key: "preferences",
                            expected: recordRevision("preferences"),
                            data: {
                              ...s.preferences,
                              dismissed: [
                                ...s.preferences.dismissed.slice(-99),
                                id,
                              ],
                            },
                          });
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Dismiss this observation
                    </button>
                  )}
                </>
              )}
              <details className="mt-2 text-xs text-ink-2">
                <summary className="min-h-11 cursor-pointer">
                  Supporting measurements
                </summary>
                <table className="w-full text-left">
                  <caption className="sr-only">
                    {o.label} in the last two weeks
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 14 }, (_, i) => addDays(to, -i)).map(
                      (date) => (
                        <tr key={date}>
                          <td className="py-1">{date}</td>
                          <td>
                            {days.find((d) => d.date === date)?.[outcome] ??
                              "Unrecorded"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </details>
            </div>
          );
        })}
      </div>
      <Link
        href="/settings"
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent"
      >
        Choose your outcomes
      </Link>
      <p className="text-xs leading-relaxed text-muted">
        Day score combines available mood, energy and inverted stress into
        0–100. It describes self-reported wellbeing; these individual outcomes
        retain their own scales.
      </p>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </Card>
  );
}

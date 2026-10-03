"use client";

import { Plus, X } from "lucide-react";
import { BODY_PARTS, SEVERITY_LABELS } from "@/lib/config";
import type { EntryData } from "@/lib/schema";
import { ScaleInput, cn } from "../ui";

type Injuries = NonNullable<EntryData["injuries"]>;

export function Injuries({
  value,
  onChange,
  carried,
}: {
  value: EntryData["injuries"];
  onChange: (v: EntryData["injuries"]) => void;
  carried: boolean;
}) {
  const list: Injuries = value ?? [];
  const taken = new Set(list.map((i) => i.part));
  const options = BODY_PARTS.filter((p) => !taken.has(p));

  const setSeverity = (part: string, severity: number | undefined) => {
    if (severity === undefined) return;
    onChange(list.map((i) => (i.part === part ? { ...i, severity } : i)));
  };

  return (
    <div className="space-y-3">
      {carried && list.length > 0 && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-ink-2">
          Carried over from your last check-in. Update the severity, or remove what&apos;s healed.
        </p>
      )}

      {list.map((injury) => (
        <div key={injury.part} className="rounded-2xl border border-line bg-surface-2/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-medium">{injury.part}</div>
            <button
              type="button"
              aria-label={`Remove ${injury.part}`}
              onClick={() => onChange(list.filter((i) => i.part !== injury.part))}
              className="grid h-9 w-9 place-items-center rounded-full text-muted active:bg-surface-2"
            >
              <X size={18} />
            </button>
          </div>
          <ScaleInput
            ariaLabel={`${injury.part} severity`}
            value={injury.severity}
            onChange={(v) => setSeverity(injury.part, v)}
            lowLabel={SEVERITY_LABELS[0]}
            highLabel={SEVERITY_LABELS[4]}
          />
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <label
          className={cn(
            "relative inline-flex h-11 select-none items-center gap-1.5 rounded-2xl border border-dashed border-line px-4 text-[15px] font-semibold text-ink-2 active:scale-95",
          )}
        >
          <Plus size={18} />
          Add injury
          <select
            aria-label="Add an injury"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value=""
            onChange={(e) => {
              if (e.target.value) onChange([...list, { part: e.target.value, severity: 2 }]);
            }}
          >
            <option value="">Choose body part…</option>
            {options.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          aria-pressed={value !== undefined && value.length === 0}
          onClick={() => onChange(value !== undefined && value.length === 0 ? undefined : [])}
          className={cn(
            "h-11 select-none rounded-2xl border px-4 text-[15px] font-semibold transition active:scale-95",
            value !== undefined && value.length === 0
              ? "border-transparent bg-accent text-on-accent shadow-sm"
              : "border-line bg-surface-2/60 text-ink-2",
          )}
        >
          {list.length > 0 ? "All healed" : "No injuries"}
        </button>
      </div>
    </div>
  );
}

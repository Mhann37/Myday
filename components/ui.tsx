"use client";

import type { KeyboardEvent, ReactNode } from "react";

export const cn = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(" ");

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Section({
  title,
  icon,
  hint,
  children,
}: {
  title: string;
  icon?: ReactNode;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <Card className="rise">
      <div className="mb-3 flex items-center gap-2">
        {icon && <span className="text-accent">{icon}</span>}
        <h2 className="font-display text-xl font-semibold">{title}</h2>
      </div>
      {hint && <p className="-mt-1 mb-3 text-sm text-muted">{hint}</p>}
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

export function Question({
  label,
  children,
  aside,
}: {
  label: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-[15px] font-medium text-ink">{label}</div>
        {aside && <div className="text-xs text-muted">{aside}</div>}
      </div>
      {children}
    </div>
  );
}

const optionBase =
  "select-none rounded-2xl border text-center font-semibold transition-[transform,background-color,color] duration-150 active:scale-95";
const optionOff = "border-line bg-surface-2/60 text-ink-2";
const optionOn = "border-transparent bg-accent text-on-accent shadow-sm";

function moveRadio(
  event: KeyboardEvent<HTMLDivElement>,
  choose: (index: number) => void,
) {
  if (
    ![
      "ArrowRight",
      "ArrowDown",
      "ArrowLeft",
      "ArrowUp",
      "Home",
      "End",
    ].includes(event.key)
  )
    return;
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]',
    ),
  );
  const current = radios.indexOf(event.target as HTMLButtonElement);
  if (current < 0) return;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? radios.length - 1
        : (current +
            (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) +
            radios.length) %
          radios.length;
  event.preventDefault();
  choose(next);
  radios[next].focus();
}

export function ScaleInput({
  value,
  onChange,
  faces,
  lowLabel,
  highLabel,
  ariaLabel,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  faces?: readonly string[];
  lowLabel?: string;
  highLabel?: string;
  ariaLabel: string;
}) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        onKeyDown={(e) => moveRadio(e, (i) => onChange(i + 1))}
        className="grid grid-cols-5 gap-2"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            tabIndex={value === n || (value === undefined && n === 1) ? 0 : -1}
            aria-checked={value === n}
            aria-label={faces ? `${n} of 5` : undefined}
            onClick={() => onChange(value === n ? undefined : n)}
            className={cn(
              optionBase,
              "h-14 text-lg",
              value === n ? optionOn : optionOff,
            )}
          >
            {faces ? (
              <span className="text-2xl leading-none">{faces[n - 1]}</span>
            ) : (
              n
            )}
          </button>
        ))}
      </div>
      {(lowLabel || highLabel) && (
        <div className="mt-1.5 flex justify-between px-1 text-xs text-muted">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { key: T; label: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(e) => moveRadio(e, (i) => onChange(options[i].key))}
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
      }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          tabIndex={
            value === o.key || (value === undefined && options[0].key === o.key)
              ? 0
              : -1
          }
          aria-checked={value === o.key}
          onClick={() => onChange(value === o.key ? undefined : o.key)}
          className={cn(
            optionBase,
            "h-12 px-2 text-[15px]",
            value === o.key ? optionOn : optionOff,
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function YesNo({
  value,
  onChange,
  ariaLabel,
}: {
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  ariaLabel: string;
}) {
  return (
    <Segmented
      ariaLabel={ariaLabel}
      options={[
        { key: "no", label: "No" },
        { key: "yes", label: "Yes" },
      ]}
      value={value === undefined ? undefined : value ? "yes" : "no"}
      onChange={(v) => onChange(v === undefined ? undefined : v === "yes")}
    />
  );
}

export function Chips({
  options,
  value,
  onChange,
  noneLabel,
  size = "md",
}: {
  options: readonly { key: string; label: string }[] | readonly string[];
  value: string[] | undefined;
  onChange: (v: string[] | undefined) => void;
  /** adds an explicit "none" chip: selecting it records an empty list (an answered "nothing") */
  noneLabel?: string;
  size?: "sm" | "md";
}) {
  const opts = options.map((o) =>
    typeof o === "string" ? { key: o, label: o } : o,
  );
  const chip = cn(
    optionBase,
    size === "sm" ? "h-11 px-3 text-sm" : "h-11 px-4 text-[15px]",
  );
  const toggle = (key: string) => {
    const cur = value ?? [];
    const next = cur.includes(key)
      ? cur.filter((k) => k !== key)
      : [...cur, key];
    onChange(next.length ? next : undefined);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {noneLabel && (
        <button
          type="button"
          aria-pressed={value !== undefined && value.length === 0}
          onClick={() =>
            onChange(value !== undefined && value.length === 0 ? undefined : [])
          }
          className={cn(
            chip,
            value !== undefined && value.length === 0 ? optionOn : optionOff,
          )}
        >
          {noneLabel}
        </button>
      )}
      {opts.map((o) => {
        const on = !!value?.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.key)}
            className={cn(chip, on ? optionOn : optionOff)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 999,
  start,
  unit,
  ariaLabel,
  format,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number;
  min?: number;
  max?: number;
  /** what the first tap sets, e.g. 7 for sleep hours */
  start?: number;
  unit?: string;
  ariaLabel: string;
  format?: (v: number) => string;
}) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const show = (v: number) => (format ? format(v) : String(v));
  const btn =
    "grid h-12 w-14 place-items-center rounded-2xl border border-line bg-surface-2/60 text-2xl font-semibold text-ink-2 transition active:scale-95 disabled:opacity-35";
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className={btn}
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value === undefined || value <= min}
        onClick={() =>
          value !== undefined && onChange(Math.max(min, round(value - step)))
        }
      >
        −
      </button>
      <button
        type="button"
        onClick={() => value === undefined && onChange(start ?? min)}
        className={cn(
          "h-12 min-w-0 flex-1 rounded-2xl border px-3 text-center text-lg font-semibold",
          value === undefined
            ? "border-dashed border-line text-muted"
            : "border-transparent bg-accent-soft text-ink",
        )}
      >
        {value === undefined
          ? "Tap to set"
          : `${show(value)}${unit ? ` ${unit}` : ""}`}
      </button>
      <button
        type="button"
        className={btn}
        aria-label={`Increase ${ariaLabel}`}
        disabled={value !== undefined && value >= max}
        onClick={() =>
          onChange(
            Math.min(
              max,
              round(
                value === undefined
                  ? (start ?? min) + (start === undefined ? step : 0)
                  : value + step,
              ),
            ),
          )
        }
      >
        +
      </button>
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  max,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
  max?: number;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value === undefined ? "" : value.toLocaleString("en-AU")}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        if (!digits) return onChange(undefined);
        const n = Number(digits);
        onChange(max !== undefined ? Math.min(n, max) : n);
      }}
      className="h-12 w-full rounded-2xl border border-line bg-surface-2/60 px-4 text-lg font-semibold text-ink placeholder:font-normal placeholder:text-muted"
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 2,
  maxLength = 400,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      aria-label={ariaLabel}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="w-full resize-none rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-ink placeholder:text-muted"
    />
  );
}

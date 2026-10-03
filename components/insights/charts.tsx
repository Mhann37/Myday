"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { addDays, formatDayMonth, formatShort, weekdayIndex } from "@/lib/dates";
import { heatColor } from "@/lib/format";
import { cn } from "../ui";

// Hand-rolled SVG charts that follow the dataviz mark specs: 2px lines, 8px
// end-dots with a surface ring, hairline recessive grid, legend for 2+ series,
// crosshair tooltip, and a table view behind every chart.

const W = 360;
const PAD = { l: 30, r: 14, t: 12, b: 24 };

export interface Series {
  key: string;
  label: string;
  /** CSS colour, usually var(--series-N) */
  color: string;
  values: (number | undefined)[];
}

function TableView({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer select-none py-1 font-medium text-ink-2">View as table</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className="px-3 py-1.5 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-1.5 tabular-nums">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function LineKey({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-0.5 w-4 rounded-full align-middle" style={{ background: color }} />;
}

export function TrendChart({
  dates,
  series,
  yMin = 1,
  yMax = 5,
  yTicks = [1, 2, 3, 4, 5],
  ariaLabel,
  height = 190,
  decimals = 1,
}: {
  dates: string[];
  series: Series[];
  yMin?: number;
  yMax?: number;
  yTicks?: number[];
  ariaLabel: string;
  height?: number;
  decimals?: number;
}) {
  const uid = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);

  const n = dates.length;
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * ih;

  const visible = series.filter((s) => !hidden.has(s.key));

  const paths = useMemo(
    () =>
      series.map((s) => {
        const segments: string[] = [];
        let current: string[] = [];
        let last = -99;
        s.values.forEach((v, i) => {
          if (v === undefined) return;
          if (i - last > 4 && current.length) {
            segments.push(current.join(" "));
            current = [];
          }
          current.push(`${current.length ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`);
          last = i;
        });
        if (current.length) segments.push(current.join(" "));
        let end: number | undefined;
        s.values.forEach((v, i) => v !== undefined && (end = i));
        return { key: s.key, d: segments.join(" "), end };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, n, height, yMin, yMax],
  );

  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - PAD.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  };

  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];
  const fmt = (v: number) => v.toFixed(decimals);

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1" role="group" aria-label="Show or hide lines">
          {series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (off) next.delete(s.key);
                    else if (visible.length > 1) next.add(s.key);
                    return next;
                  })
                }
                className={cn("flex items-center gap-1.5 py-1 text-sm font-medium text-ink-2 transition-opacity", off && "opacity-40")}
              >
                <LineKey color={s.color} />
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="relative" tabIndex={0} onKeyDown={onKey} aria-label={`${ariaLabel}. Use left and right arrow keys to inspect days.`} role="group">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} className="block w-full select-none" role="img" aria-labelledby={`${uid}-t`}>
          <title id={`${uid}-t`}>{ariaLabel}</title>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--muted)">
                {t}
              </text>
            </g>
          ))}
          <line x1={PAD.l} x2={W - PAD.r} y1={y(yMin)} y2={y(yMin)} stroke="var(--axis)" strokeWidth={1} />
          {labelIdx.map((i, k) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={k === 0 && n > 1 ? "start" : k === labelIdx.length - 1 && n > 1 ? "end" : "middle"} fontSize={10} fill="var(--muted)">
              {formatDayMonth(dates[i])}
            </text>
          ))}

          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--axis)" strokeWidth={1} />}

          {series.map((s, si) => {
            if (hidden.has(s.key)) return null;
            const p = paths[si];
            return (
              <g key={s.key}>
                <path d={p.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {p.end !== undefined && hover === null && (
                  <circle cx={x(p.end)} cy={y(s.values[p.end]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                )}
                {hover !== null && s.values[hover] !== undefined && (
                  <circle cx={x(hover)} cy={y(s.values[hover]!)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                )}
              </g>
            );
          })}

          {/* generous hit area: the pointer only needs to be near the right day */}
          <rect
            x={PAD.l}
            y={PAD.t}
            width={iw}
            height={ih}
            fill="transparent"
            style={{ touchAction: "pan-y" }}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          />
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-32 rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > n * 0.6 ? "calc(-100% - 10px)" : "10px"})` }}
          >
            <div className="mb-1 text-xs font-medium text-muted">{formatShort(dates[hover])}</div>
            {visible.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <LineKey color={s.color} /> {s.label}
                </span>
                <span className="font-semibold tabular-nums">{s.values[hover] === undefined ? "–" : fmt(s.values[hover]!)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <TableView
        caption={ariaLabel}
        head={["Day", ...series.map((s) => s.label)]}
        rows={dates
          .map((d, i) => [formatDayMonth(d), ...series.map((s) => (s.values[i] === undefined ? "–" : fmt(s.values[i]!)))] as (string | number)[])
          .reverse()}
      />
    </div>
  );
}

// ------------------------------------------------------------------ heatmap

const CELL = 19;
const GAP = 3;
const LABEL_W = 16;
const TOP = 16;

export function Heatmap({
  scores,
  today,
  weeks = 15,
}: {
  /** date -> day score (0-100) */
  scores: Map<string, number>;
  today: string;
  weeks?: number;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const todayDow = weekdayIndex(today);
  const start = addDays(today, -todayDow - (weeks - 1) * 7);
  const width = LABEL_W + weeks * (CELL + GAP);
  const height = TOP + 7 * (CELL + GAP);

  const cells: { date: string; col: number; row: number }[] = [];
  for (let c = 0; c < weeks; c++)
    for (let r = 0; r < 7; r++) {
      const date = addDays(start, c * 7 + r);
      if (date <= today) cells.push({ date, col: c, row: r });
    }

  const monthLabels = cells
    .filter((c) => c.row === 0 && (c.col === 0 || c.date.slice(5, 7) !== addDays(c.date, -7).slice(5, 7)))
    .map((c) => ({ col: c.col, label: new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(new Date(`${c.date}T00:00:00Z`)) }));

  const sel = selected ? scores.get(selected) : undefined;
  const tableRows = cells
    .filter((c) => scores.has(c.date))
    .map((c) => [formatShort(c.date), Math.round(scores.get(c.date)!)] as (string | number)[])
    .reverse();

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" role="img" aria-label="Calendar of daily scores for the last few months">
        {["M", "W", "F"].map((l, i) => (
          <text key={l} x={0} y={TOP + i * 2 * (CELL + GAP) + CELL / 2 + (CELL + GAP) * 0} dominantBaseline="middle" fontSize={9} fill="var(--muted)">
            {l}
          </text>
        ))}
        {monthLabels.map((m) => (
          <text key={m.col} x={LABEL_W + m.col * (CELL + GAP)} y={9} fontSize={9} fill="var(--muted)">
            {m.label}
          </text>
        ))}
        {cells.map((c) => {
          const score = scores.get(c.date);
          const isSel = selected === c.date;
          return (
            <rect
              key={c.date}
              x={LABEL_W + c.col * (CELL + GAP)}
              y={TOP + c.row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={5}
              style={{ fill: heatColor(score), stroke: isSel || c.date === today ? "var(--accent)" : "none", strokeWidth: 2, cursor: "pointer" }}
              onPointerDown={() => setSelected(c.date === selected ? null : c.date)}
              onPointerEnter={(e) => e.pointerType === "mouse" && setSelected(c.date)}
            >
              <title>{`${formatShort(c.date)}${score === undefined ? ": no data" : `: score ${Math.round(score)}`}`}</title>
            </rect>
          );
        })}
      </svg>

      <div className="mt-2 flex min-h-6 items-center justify-between gap-3 text-sm">
        <div className="text-ink-2" aria-live="polite">
          {selected ? (
            <>
              <span className="font-semibold text-ink">{formatShort(selected)}</span> · {sel === undefined ? "no data" : `score ${Math.round(sel)}`}
            </>
          ) : (
            "Tap a day"
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted" aria-hidden>
          Lower
          {[0, 1, 2, 3, 4].map((b) => (
            <span key={b} className="h-3.5 w-3.5 rounded" style={{ background: `var(--heat-${b})` }} />
          ))}
          Higher
        </div>
      </div>

      <TableView caption="Daily scores" head={["Day", "Score"]} rows={tableRows} />
    </div>
  );
}

// ----------------------------------------------------------- weekday bars

const BAR_W = 360;
const BAR_H = 150;

export function WeekdayBars({ data }: { data: { avg: number | undefined; n: number }[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const known = data.map((d, i) => ({ ...d, i })).filter((d) => d.avg !== undefined);
  const best = known.reduce<number | null>((b, d) => (b === null || d.avg! > data[b].avg! ? d.i : b), null);
  const worst = known.reduce<number | null>((b, d) => (b === null || d.avg! < data[b].avg! ? d.i : b), null);
  const slot = BAR_W / 7;
  const bw = 24;
  const base = BAR_H - 22;
  const top = 20;
  const h = (v: number) => (v / 100) * (base - top);

  return (
    <div>
      <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} className="block w-full" role="img" aria-label="Average day score by weekday">
        <line x1={0} x2={BAR_W} y1={base} y2={base} stroke="var(--axis)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = slot * i + slot / 2;
          const isBest = i === best && known.length > 1;
          const label = isBest || (i === worst && known.length > 1) || selected === i;
          return (
            <g key={i} onPointerDown={() => setSelected(selected === i ? null : i)} onPointerEnter={(e) => e.pointerType === "mouse" && setSelected(i)} style={{ cursor: "pointer" }}>
              <rect x={slot * i} y={0} width={slot} height={BAR_H} fill="transparent" />
              {d.avg !== undefined && (
                <>
                  {/* 4px rounded data-end, square at the baseline */}
                  <path
                    d={`M${cx - bw / 2} ${base} V${base - h(d.avg) + 4} Q${cx - bw / 2} ${base - h(d.avg)} ${cx - bw / 2 + 4} ${base - h(d.avg)} H${cx + bw / 2 - 4} Q${cx + bw / 2} ${base - h(d.avg)} ${cx + bw / 2} ${base - h(d.avg) + 4} V${base} Z`}
                    fill={isBest ? "var(--series-1)" : "var(--axis)"}
                    opacity={selected !== null && selected !== i ? 0.55 : 1}
                  />
                  {label && (
                    <text x={cx} y={base - h(d.avg) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)">
                      {Math.round(d.avg)}
                    </text>
                  )}
                </>
              )}
              <text x={cx} y={BAR_H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
                {names[i]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 min-h-5 text-sm text-ink-2" aria-live="polite">
        {selected !== null && data[selected].avg !== undefined
          ? `${names[selected]}: average score ${Math.round(data[selected].avg!)} over ${data[selected].n} day${data[selected].n === 1 ? "" : "s"}`
          : best !== null && known.length > 1
            ? `Best day so far: ${names[best]}`
            : ""}
      </div>
      <TableView
        caption="Average day score by weekday"
        head={["Weekday", "Avg score", "Days"]}
        rows={data.map((d, i) => [names[i], d.avg === undefined ? "–" : Math.round(d.avg), d.n])}
      />
    </div>
  );
}

// -------------------------------------------------------------- meter rows

/** A labelled meter: filled share on a lighter step of the same hue. */
export function Meter({
  label,
  value,
  max,
  right,
  color = "var(--series-1)",
}: {
  label: ReactNode;
  value: number;
  max: number;
  right?: ReactNode;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-2">{right}</span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 18%, var(--surface))` }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={typeof label === "string" ? label : undefined}
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

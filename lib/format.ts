/** Day score (0-100) -> sequential bucket 0-4, used for the heat colours. */
export function heatBucket(score: number): 0 | 1 | 2 | 3 | 4 {
  return Math.max(0, Math.min(4, Math.floor(score / 20))) as 0 | 1 | 2 | 3 | 4;
}

export const heatColor = (score: number | undefined) =>
  score === undefined ? "var(--heat-empty)" : `var(--heat-${heatBucket(score)})`;

/** Readable text colour for a label sitting on the heat colour for this score. */
export const heatText = (score: number | undefined) =>
  score === undefined ? "var(--ink-2)" : `var(--heat-text-${heatBucket(score)})`;

export function round1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

export function signed(n: number, digits = 1): string {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
}

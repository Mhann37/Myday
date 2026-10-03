// Small, dependency-free statistics used by the insights engine.

/** ln(Gamma(x)), Lanczos approximation. */
function lgamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const xm = x - 1;
  let a = c[0];
  const t = xm + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (xm + i);
  return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** Two-sided p-value for a t statistic with `df` degrees of freedom. */
export function tTestP(t: number, df: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, incompleteBeta(df / (df + t * t), df / 2, 0.5));
}

export interface GroupStats {
  n: number;
  m: number;
  v: number;
}

export interface ComparisonResult {
  diff: number;
  t: number;
  df: number;
  p: number;
}

/**
 * Compares two group means. The p-value is the larger (more cautious) of
 * Welch's unequal-variance test and Student's pooled-variance test.
 *
 * Why both: simulations on 1-5 style data show Welch alone is badly
 * overconfident when one group is small (say 6-11 days against 60+), because
 * the small group's own variance estimate is too noisy. The pooled test fixes
 * that case but is itself overconfident when the small group is the noisy one.
 * Taking the larger p-value guards against both failure modes.
 */
export function compareGroups(a: GroupStats, b: GroupStats): ComparisonResult | null {
  const va = a.v / a.n;
  const vb = b.v / b.n;
  const se2 = va + vb;
  if (!(se2 > 0)) return null;
  const diff = a.m - b.m;

  const welchT = diff / Math.sqrt(se2);
  const welchDf = (se2 * se2) / ((va * va) / (a.n - 1) + (vb * vb) / (b.n - 1));
  const welchP = tTestP(welchT, welchDf);

  const pooledDf = a.n + b.n - 2;
  const pooledVar = ((a.n - 1) * a.v + (b.n - 1) * b.v) / pooledDf;
  const pooledT = diff / Math.sqrt(pooledVar * (1 / a.n + 1 / b.n));
  const pooledP = tTestP(pooledT, pooledDf);

  return welchP >= pooledP
    ? { diff, t: welchT, df: welchDf, p: welchP }
    : { diff, t: pooledT, df: pooledDf, p: pooledP };
}

/**
 * Benjamini-Hochberg adjusted p-values (q-values). With ~280 comparisons run at
 * once, some will look "significant" by pure chance; q is the expected share of
 * false discoveries if you act on everything at or below that q.
 */
export function benjaminiHochberg(p: number[]): number[] {
  const m = p.length;
  const order = p.map((value, i) => ({ value, i })).sort((x, y) => x.value - y.value);
  const q = new Array<number>(m);
  let running = 1;
  for (let rank = m; rank >= 1; rank--) {
    const { value, i } = order[rank - 1];
    running = Math.min(running, (value * m) / rank);
    q[i] = running;
  }
  return q;
}

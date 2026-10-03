// Single-passcode auth. A successful login sets a signed, expiring, httpOnly
// cookie. The signing key is derived from APP_PASSCODE (+ optional AUTH_SECRET),
// so changing the passcode signs every device out. Web Crypto only, so this
// module is safe to use from proxy.ts and from route handlers.

export const SESSION_COOKIE = "myday_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

const enc = new TextEncoder();

function secretMaterial(): string | null {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return null;
  return `${pass}|${process.env.AUTH_SECRET ?? ""}`;
}

async function hmac(key: string, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function passcodeConfigured(): boolean {
  return secretMaterial() !== null;
}

/** Constant-time passcode comparison. */
export async function checkPasscode(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmac("myday-passcode-check", candidate), hmac("myday-passcode-check", expected)]);
  return safeEqual(a, b);
}

export async function createSessionToken(nowMs: number = Date.now()): Promise<string> {
  const key = secretMaterial();
  if (!key) throw new Error("APP_PASSCODE is not set");
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE;
  return `${exp}.${toHex(await hmac(key, `v1.${exp}`))}`;
}

export async function verifySessionToken(token: string | undefined, nowMs: number = Date.now()): Promise<boolean> {
  const key = secretMaterial();
  if (!key || !token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const expected = await hmac(key, `v1.${exp}`);
  return safeEqual(enc.encode(sig), enc.encode(toHex(expected)));
}

/** For route handlers: true when the request carries a valid session cookie. */
export async function isAuthenticated(request: Request): Promise<boolean> {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return verifySessionToken(match?.slice(SESSION_COOKIE.length + 1));
}

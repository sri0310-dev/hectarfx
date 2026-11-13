// Simple static-credential auth for internal use.
// Edge-compatible (uses Web Crypto) so it can run in middleware.

export const SESSION_COOKIE = "hfx_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const ALLOWED_USERS = [
  "sri@hectar.global",
  "ritesh@hectar.global",
  "aswath@hectar.global",
  "sibhi@hectar.global",
];

const SHARED_PASSWORD = "Hectarfx123!";

// Session cookies are signed with AUTH_SECRET. Until that is set, fall back to
// the server-only Google service account secret (already present in prod) so
// cookies can't be forged by anyone who has only read the source code.
// The literal string is a last resort for local dev with no env at all.
const FALLBACK_SECRET = "hectarfx-internal-session-secret-change-me";

function getSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    FALLBACK_SECRET
  );
}

export function checkCredentials(username: string, password: string): string | null {
  const user = username.trim().toLowerCase();
  if (ALLOWED_USERS.includes(user) && password === SHARED_PASSWORD) return user;
  return null;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(sig);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(user: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = toBase64Url(encoder.encode(JSON.stringify({ u: user, exp })));
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, await hmac(payload))) return null;
  try {
    const { u, exp } = JSON.parse(fromBase64Url(payload));
    if (typeof u !== "string" || !ALLOWED_USERS.includes(u)) return null;
    if (typeof exp !== "number" || exp < Date.now() / 1000) return null;
    return u;
  } catch {
    return null;
  }
}

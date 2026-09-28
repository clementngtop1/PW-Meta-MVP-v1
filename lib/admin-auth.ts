import { env } from "cloudflare:workers";

const COOKIE = "pw_admin_session";
const SESSION_DAYS = 7;
const encoder = new TextEncoder();

export const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("");
export const sha256 = async (value: string | ArrayBuffer) => hex(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value));

export async function passwordHash(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/.{2}/g) ?? [], part => parseInt(part, 16));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 }, key, 256));
}

export function equalHash(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Admin = { id: number; email: string };

export async function getAdmin(request: Request): Promise<Admin | null> {
  const token = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(`SELECT u.id,u.email FROM admin_sessions s JOIN admin_users u ON u.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.active=1`).bind(hash).first<Admin>();
  return row ?? null;
}

export async function requireAdmin(request: Request): Promise<{ admin: Admin; response?: never } | { admin?: never; response: Response }> {
  try {
    const admin = await getAdmin(request);
    if (!admin) return { response: Response.json({ error: "Administrator login required." }, { status: 401 }) };
    if (!["GET", "HEAD"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (!origin || origin !== new URL(request.url).origin) return { response: Response.json({ error: "Invalid request origin." }, { status: 403 }) };
    }
    return { admin };
  } catch {
    return { response: Response.json({ error: "Authentication service unavailable." }, { status: 503 }) };
  }
}

export async function audit(adminId: number | null, action: string, detail: string, request: Request) {
  await env.DB.prepare(`INSERT INTO admin_audit(admin_id,action,detail,ip) VALUES(?,?,?,?)`).bind(adminId, action, detail.slice(0, 1000), request.headers.get("CF-Connecting-IP") ?? null).run();
}

export function sessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearSessionCookie(request: Request) {
  return sessionCookie("", request).replace(/Max-Age=\d+/, "Max-Age=0");
}

export async function createSession(adminId: number) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const expiry = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await env.DB.prepare(`INSERT INTO admin_sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)`).bind(await sha256(token), adminId, expiry).run();
  return token;
}

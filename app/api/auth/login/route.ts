import { env } from "cloudflare:workers";
import { audit, createSession, equalHash, passwordHash, sessionCookie, sha256 } from "@/lib/admin-auth";

type User = { id: number; email: string; password_hash: string; password_salt: string };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid login request." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 1024) return Response.json({ error: "Enter email and password." }, { status: 400 });
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const key = await sha256(`${ip}:${email}`);
  const attempt = await env.DB.prepare(`SELECT count,window_start FROM login_attempts WHERE key=?`).bind(key).first<{ count: number; window_start: string }>();
  const now = new Date();
  const withinWindow = attempt && Date.now() - Date.parse(attempt.window_start) < 15 * 60_000;
  if (withinWindow && attempt.count >= 5) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const user = await env.DB.prepare(`SELECT id,email,password_hash,password_salt FROM admin_users WHERE email=? AND active=1`).bind(email).first<User>();
  const candidate = await passwordHash(password, user?.password_salt ?? "00000000000000000000000000000000");
  if (!user || !equalHash(candidate, user.password_hash)) {
    await env.DB.prepare(`INSERT INTO login_attempts(key,count,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END`).bind(key, now.toISOString(), new Date(Date.now() - 15 * 60_000).toISOString(), new Date(Date.now() - 15 * 60_000).toISOString()).run();
    await audit(user?.id ?? null, "login_failed", email, request);
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }
  await env.DB.prepare(`DELETE FROM login_attempts WHERE key=?`).bind(key).run();
  const token = await createSession(user.id);
  await audit(user.id, "login", email, request);
  return Response.json({ admin: { id: user.id, email: user.email } }, { headers: { "Set-Cookie": sessionCookie(token, request), "Cache-Control": "no-store" } });
}

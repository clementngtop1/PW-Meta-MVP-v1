import { env } from "cloudflare:workers";
import { audit, clearSessionCookie, getAdmin, sha256 } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const admin = await getAdmin(request);
  const token = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith("pw_admin_session="))?.slice(17);
  if (token) await env.DB.prepare(`DELETE FROM admin_sessions WHERE token_hash=?`).bind(await sha256(token)).run();
  if (admin) await audit(admin.id, "logout", "", request);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookie(request), "Cache-Control": "no-store" } });
}

import { getAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const admin = await getAdmin(request);
  return admin ? Response.json({ admin }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Administrator login required." }, { status: 401 });
}

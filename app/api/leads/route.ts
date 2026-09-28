import { env } from "cloudflare:workers";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { reportDates } from "@/lib/report-data";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  if (!env.DB) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const url = new URL(request.url);
  const term = url.searchParams.get("search")?.trim() ?? "";
  if (term.length > 200) return Response.json({error:"Search is too long."},{status:400});
  const search = `%${term}%`;
  let from = "0000-01-01", to = "9999-12-31";
  if (url.searchParams.has("from") || url.searchParams.has("to")) { try { ({from,to} = reportDates(url)); } catch { return Response.json({error:"Invalid date range."},{status:400}); } }
  const result = await env.DB.prepare(`SELECT l.meta_lead_id metaLeadId,l.created_time createdTime,l.full_name fullName,l.phone,l.email,l.city,l.platform,l.purpose,l.income_range incomeRange,l.campaign_name campaignName,l.assigned_agent_id assignedAgentId,l.current_source_batch_id sourceBatchId,b.file_name sourceFileName FROM leads l LEFT JOIN import_batches b ON b.id=l.current_source_batch_id WHERE l.is_test=0 AND date(l.created_time) BETWEEN ? AND ? AND (l.meta_lead_id LIKE ? OR l.full_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?) ORDER BY l.created_time DESC LIMIT 100`).bind(from,to,search,search, search, search).all();
  return Response.json({ leads: result.results });
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  if (!env.DB) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const body = await request.json() as { metaLeadId?: unknown; metaLeadIds?: unknown; agentId?: unknown };
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const submittedIds = body.metaLeadIds ?? (body.metaLeadId ? [body.metaLeadId] : []);
  if (!Array.isArray(submittedIds) || submittedIds.some(id => typeof id !== "string" || !id.trim())) {
    return Response.json({ error: "metaLeadIds must be a list of valid IDs." }, { status: 400 });
  }
  const ids = [...new Set(submittedIds as string[])];
  if (!agentId || !ids.length || ids.length > 100) {
    return Response.json({ error: "Provide an agent ID and 1–100 valid Meta Lead IDs." }, { status: 400 });
  }
  const placeholders = ids.map(() => "?").join(",");
  const result = await env.DB.prepare(`UPDATE leads SET assigned_agent_id=?, assigned_at=CURRENT_TIMESTAMP WHERE is_test=0 AND meta_lead_id IN (${placeholders})`)
    .bind(agentId, ...ids).run();
  await audit(auth.admin.id, "assign_leads", `${result.meta.changes} leads to ${agentId}`, request);
  return Response.json({ ok: true, updated: result.meta.changes });
}

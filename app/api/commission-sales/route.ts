import { env } from "cloudflare:workers";
import { requireAdmin } from "@/lib/admin-auth";
import { reportDates } from "@/lib/report-data";
import { isLeadAgentId } from "@/lib/lead-agent-options";
import { agentCommissionSalesSql } from "@/lib/commission-sales-query";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  let from = "0000-01-01", to = "9999-12-31";
  if (url.searchParams.has("from") || url.searchParams.has("to")) {
    try { ({ from, to } = reportDates(url)); } catch { return Response.json({ error: "Invalid date range." }, { status: 400 }); }
  }
  const agentId = url.searchParams.get("agentId") ?? "";
  if (!isLeadAgentId(agentId)) return Response.json({ error: "Select a valid Agent Code." }, { status: 400 });
  const result = await env.DB.prepare(`${agentCommissionSalesSql} LIMIT 100`).bind(from, to, agentId).all();
  return Response.json({ sales: result.results });
}

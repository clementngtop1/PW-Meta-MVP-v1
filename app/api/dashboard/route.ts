import { requireAdmin } from "@/lib/admin-auth";
import { defaultReportDates, loadReport, reportDates } from "@/lib/report-data";
import { isLeadAgentId } from "@/lib/lead-agent-options";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    const dates = url.searchParams.has("from") || url.searchParams.has("to") ? reportDates(url) : await defaultReportDates();
    const agentId = url.searchParams.get("agentId") ?? "";
    if (agentId && !isLeadAgentId(agentId)) return Response.json({ error: "Invalid Agent ID." }, { status: 400 });
    return Response.json({ ...await loadReport(dates.from, dates.to, agentId), dates, agentId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load dashboard" }, { status: 400 });
  }
}

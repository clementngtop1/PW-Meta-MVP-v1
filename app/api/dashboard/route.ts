import { requireAdmin } from "@/lib/admin-auth";
import { defaultReportDates, loadReport, reportDates } from "@/lib/report-data";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    const dates = url.searchParams.has("from") || url.searchParams.has("to") ? reportDates(url) : await defaultReportDates();
    return Response.json({ ...await loadReport(dates.from, dates.to), dates }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to load dashboard" }, { status: 400 });
  }
}

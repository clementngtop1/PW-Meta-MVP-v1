import { env } from "cloudflare:workers";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { csvText } from "@/lib/csv";
import { loadReport, reportDates } from "@/lib/report-data";
import { isLeadAgentId } from "@/lib/lead-agent-options";
import { agentCommissionSalesSql } from "@/lib/commission-sales-query";

type DataRow = Record<string, string | number | null>;

async function allRows(sql: string, from: string, to: string, ...filters: string[]): Promise<DataRow[]> {
  const rows: DataRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await env.DB.prepare(`${sql} LIMIT 500 OFFSET ?`).bind(from, to, ...filters, offset).all<DataRow>();
    rows.push(...result.results);
    if (result.results.length < 500) break;
    if (offset >= 99_500) throw new Error("Export exceeds 100,000 rows. Narrow the date range.");
  }
  return rows;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const url = new URL(request.url);
    const { from, to } = reportDates(url);
    const dataset = url.searchParams.get("dataset") ?? "";
    if (!["leads","ads","bookings","commissions","campaign","summary","monthly-roi"].includes(dataset)) return Response.json({ error: "Invalid export type." }, { status: 400 });
    const agentId = url.searchParams.get("agentId") ?? "";
    if ((dataset === "commissions" && !isLeadAgentId(agentId)) || (agentId && !isLeadAgentId(agentId))) return Response.json({ error: "Invalid Agent ID." }, { status: 400 });
    const search = url.searchParams.get("search")?.trim() ?? "";
    if (search.length > 200) return Response.json({ error: "Search is too long." }, { status: 400 });
    const generatedAt = new Date().toISOString();
    let headers: string[] = [];
    let values: unknown[][] = [];
    if (dataset === "leads") {
      const pattern = `%${search}%`;
      const rows = await allRows(`SELECT l.meta_lead_id metaLeadId,l.created_time createdTime,l.full_name fullName,l.phone,l.email,l.city,l.platform,l.purpose,l.income_range incomeRange,l.campaign_id campaignId,l.campaign_name campaignName,l.ad_id adId,l.assigned_agent_id assignedAgentId,l.current_source_batch_id sourceBatchId,b.file_name sourceFileName,b.coverage_start sourceCoverageStart,b.coverage_end sourceCoverageEnd,(SELECT MIN(r.file_row) FROM import_batch_rows r WHERE r.batch_id=l.current_source_batch_id AND r.record_type='leads' AND r.record_id=l.meta_lead_id AND r.action<>'skipped') sourceFileRow FROM leads l LEFT JOIN import_batches b ON b.id=l.current_source_batch_id WHERE l.is_test=0 AND date(l.created_time) BETWEEN ? AND ? AND (l.full_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ?) ORDER BY l.created_time,l.meta_lead_id`, from, to, pattern, pattern, pattern);
      headers = ["metaLeadId","createdTime","fullName","phone","email","city","platform","purpose","incomeRange","campaignId","campaignName","adId","assignedAgentId","sourceBatchId","sourceFileName","sourceCoverageStart","sourceCoverageEnd","sourceFileRow"];
      values = rows.map(row => headers.map(header => row[header]));
    } else if (dataset === "ads") {
      const rows = await allRows(`SELECT a.day,b.agent_id agentId,a.campaign_id campaignId,a.campaign_name campaignName,a.adset_id adsetId,a.ad_id adId,a.result_type resultType,a.results,a.spend,a.impressions,a.reach,a.link_clicks linkClicks,a.current_source_batch_id sourceBatchId,b.file_name sourceFileName,b.coverage_start sourceCoverageStart,b.coverage_end sourceCoverageEnd,(SELECT MIN(r.file_row) FROM import_batch_rows r WHERE r.batch_id=a.current_source_batch_id AND r.record_type='ads' AND r.record_id=a.day || ':' || a.ad_id AND r.action<>'skipped') sourceFileRow FROM ad_insights_daily a LEFT JOIN import_batches b ON b.id=a.current_source_batch_id WHERE a.day BETWEEN ? AND ? ORDER BY a.day,a.ad_id`, from, to);
      headers = ["day","agentId","campaignId","campaignName","adsetId","adId","resultType","results","spend","impressions","reach","linkClicks","sourceBatchId","sourceFileName","sourceCoverageStart","sourceCoverageEnd","sourceFileRow"];
      values = rows.map(row => headers.map(header => row[header]));
    } else if (dataset === "bookings") {
      const rows = await allRows(`SELECT o.booking_id bookingId,COALESCE(o.meta_lead_id,x.meta_lead_id) metaLeadId,o.agent_id agentId,o.project_id projectId,o.unit_id unitId,o.booking_date bookingDate,o.booking_status bookingStatus,o.sale_status saleStatus,o.sale_date saleDate,o.cancelled_date cancelledDate,o.selling_price sellingPrice,o.estimated_commission estimatedCommission,o.paid_commission paidCommission,o.commission_payout_date commissionPayoutDate,o.current_source_batch_id sourceBatchId,b.file_name sourceFileName,b.coverage_start sourceCoverageStart,b.coverage_end sourceCoverageEnd,(SELECT MIN(r.file_row) FROM import_batch_rows r WHERE r.batch_id=o.current_source_batch_id AND r.record_type='bookings' AND r.record_id=o.booking_id AND r.action<>'skipped') sourceFileRow FROM bookings o LEFT JOIN import_batches b ON b.id=o.current_source_batch_id LEFT JOIN sale_lead_links x ON x.sales_no=o.booking_id WHERE o.booking_date BETWEEN ? AND ? ORDER BY o.booking_date,o.booking_id`, from, to);
      headers = ["bookingId","metaLeadId","agentId","projectId","unitId","bookingDate","bookingStatus","saleStatus","saleDate","cancelledDate","sellingPrice","estimatedCommission","paidCommission","commissionPayoutDate","sourceBatchId","sourceFileName","sourceCoverageStart","sourceCoverageEnd","sourceFileRow"];
      values = rows.map(row => headers.map(header => row[header]));
    } else if (dataset === "commissions") {
      const rows = await allRows(agentCommissionSalesSql, from, to, agentId);
      headers = ["salesNo","sourceDate","projectName","unitNumber","lineCount","agentCode","commissionAmount","sourceBatchId","sourceFileName","sourceCoverageStart","sourceCoverageEnd"];
      values = rows.map(row => headers.map(header => row[header]));
    } else {
      const report = await loadReport(from,to);
      const sourceBatchIds = Object.values(report.coverage).flatMap(item => item.batchIds).join(";");
      if (dataset === "campaign") {
        headers = ["campaignId","campaignName","spend","leads","cpl","sourceBatchIds"];
        values = (report.campaigns as DataRow[]).map(row => [row.campaignId,row.campaignName,row.spend,row.leads,Number(row.leads) && row.spend != null ? Number(row.spend)/Number(row.leads) : null,sourceBatchIds]);
      } else if (dataset === "monthly-roi") {
        headers = ["month","agentId","leads","adRows","adSpend","sales","directCommissionLines","directCommission","roi","status","adsBatchIds","commissionBatchIds"];
        values = report.monthlyRoi.filter(row => !agentId || row.agentId === agentId).map(row => [
          row.month,row.agentId,row.leads,row.adRows,row.spend,row.sales,row.commissionLines,row.commission,row.roi,
          row.roi == null ? "No agent-assigned ad spend for this month" : "Calculated",row.adsBatchIds,row.commissionBatchIds,
        ]);
      } else {
        headers = ["metric","value","sourceBatchIds"];
        values = Object.entries(report.summary as DataRow).map(([metric,value]) => [metric,value,sourceBatchIds]);
        values.push(...Object.entries(report.coverage).map(([type,item]) => [`${type}Coverage`,`${item.status}; ${item.missingDays} missing days`,item.batchIds.join(";")]));
      }
    }
    const metadata = ["reportFrom","reportTo","dateBasis","generatedAt"];
    const dateBasis = dataset === "leads" ? "Lead created_time" : dataset === "ads" ? "Ads Day" : dataset === "bookings" ? "Legacy Booking booking_date" : dataset === "commissions" ? "Earliest line Date per Propwealth Sales No; only selected Agent Code direct Commission lines and amount; ROI uses Commission Payout Date instead" : dataset === "monthly-roi" ? "Agent-assigned Ads Day and direct Commission lines by Commission Payout Date; ROI=(commission-spend)/spend; no Lead-to-Sale link" : "Lead created_time and Ads Day; no Lead-to-Sale ROI attribution";
    headers.push(...metadata);
    values = values.map(row => [...row,from,to,dateBasis,generatedAt]);
    const body = csvText(headers,values);
    await audit(auth.admin.id, "csv_export", `${dataset} ${from}..${to} agent=${agentId || "all"} filtered=${Boolean(search)} rows=${values.length}`, request);
    const fileName = `propwealth-${dataset}${dataset === "commissions" ? `-${agentId}` : ""}-${from}-${to}.csv`;
    return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 400 });
  }
}

import { env } from "cloudflare:workers";
import { validDate } from "@/lib/import-workbook";
import { campaignSql, monthlyAgentRoiSql, summarySql } from "@/lib/commission-report-queries";
import { summarizeCommissionRoas } from "@/lib/marketing-roas";

export function reportDates(url: URL) {
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!validDate(from) || !validDate(to) || from > to) throw new Error("Choose a valid start and end date.");
  return { from, to };
}

export async function defaultReportDates() {
  const latest = await env.DB.prepare(`SELECT b.coverage_start fromDate,b.coverage_end toDate FROM import_batches b WHERE b.type='leads' AND b.status='completed' AND b.coverage_start IS NOT NULL
    AND EXISTS(SELECT 1 FROM leads l WHERE l.current_source_batch_id=b.id) ORDER BY b.completed_at DESC,b.id DESC LIMIT 1`).first<{ fromDate: string; toDate: string }>();
  if (latest) return { from: latest.fromDate, to: latest.toDate };
  const today = new Date();
  const start = new Date(today.getTime() - 29 * 86400_000);
  return { from: start.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
}

export async function loadReport(from: string, to: string, agentId = "") {
  const [summary, campaigns, monthly, batches, imports] = await env.DB.batch([
    env.DB.prepare(summarySql)
      .bind(from,to,agentId,agentId,from,to,agentId,agentId,from,to),
    env.DB.prepare(campaignSql).bind(from,to,agentId,agentId,from,to,agentId,agentId),
    env.DB.prepare(monthlyAgentRoiSql).bind(from,to,from,to,from,to),
    env.DB.prepare(`SELECT b.id,b.type,b.coverage_start coverageStart,b.coverage_end coverageEnd FROM import_batches b
      WHERE b.status='completed' AND (
        (b.type='leads' AND (?='' OR UPPER(TRIM(b.agent_id))=?) AND b.coverage_start<=? AND b.coverage_end>=? AND EXISTS(SELECT 1 FROM leads l WHERE l.current_source_batch_id=b.id))
        OR (b.type='ads' AND (?='' OR UPPER(TRIM(b.agent_id))=?) AND b.coverage_start<=? AND b.coverage_end>=? AND EXISTS(SELECT 1 FROM ad_insights_daily a WHERE a.current_source_batch_id=b.id))
      )`).bind(agentId,agentId,to,from,agentId,agentId,to,from),
    env.DB.prepare(`SELECT id,type,file_name fileName,status,total_rows totalRows,valid_rows validRows,error_rows errorRows,coverage_start coverageStart,coverage_end coverageEnd,message,created_at createdAt FROM import_batches ORDER BY id DESC LIMIT 10`),
  ]);
  const completed = batches.results as { id:number; type:string; coverageStart:string; coverageEnd:string }[];
  const coverage = Object.fromEntries(["leads", "ads"].map(type => {
    const matching = completed.filter(batch => batch.type === type);
    const missingDays: string[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const last = new Date(`${to}T00:00:00Z`).getTime();
    while (cursor.getTime() <= last && missingDays.length < 366) {
      const day = cursor.toISOString().slice(0,10);
      if (!matching.some(batch => batch.coverageStart <= day && batch.coverageEnd >= day)) missingDays.push(day);
      cursor.setUTCDate(cursor.getUTCDate()+1);
    }
    return [type, { batchIds: matching.map(batch => batch.id), status: missingDays.length ? matching.length ? "partial" : "missing" : "covered", missingDays: missingDays.length }];
  }));
  const monthlyRoi = (monthly.results as { month:string; agentId:string; leads:number; adRows:number; spend:number; sales:number; commissionLines:number; commission:number; adsBatchIds:string|null; commissionBatchIds:string|null }[])
    .filter(row => !agentId || row.agentId === agentId)
    .map(row => ({ ...row,
      roi: row.adRows > 0 && row.spend > 0 ? (row.commission - row.spend) / row.spend : null,
      commissionBasedRoas: row.adRows > 0 && row.spend > 0 ? row.commission / row.spend : null,
      marketingRoas: null as null,
    }));
  const commissionBatchIds = [...new Set(monthlyRoi.flatMap(row => row.commissionBatchIds?.split(",").map(Number) ?? []))];
  coverage.commissions = { batchIds: commissionBatchIds, status: monthlyRoi.some(row => row.commissionLines > 0) ? "available" : "missing", missingDays: 0 };
  const roas = summarizeCommissionRoas(monthlyRoi);
  return { summary: summary.results[0] ?? {}, campaigns: campaigns.results, monthlyRoi, roas, coverage, imports: imports.results,
    generatedAt: new Date().toISOString(), dateBasis: "Monthly agent Ads Day and direct Commission Payout Date; no Meta Lead-to-Sale link required" };
}

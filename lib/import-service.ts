import { env } from "cloudflare:workers";
import { parseWorkbook, validDate, type ParsedRow, type ReportType } from "@/lib/import-workbook";
import { sha256 } from "@/lib/admin-auth";
import { isLeadAgentId } from "@/lib/lead-agent-options";

export type ImportInput = { type: ReportType; file: File; agentId: string; coverageStart: string; coverageEnd: string; bytes: ArrayBuffer; hash: string; rows: ParsedRow[]; sourceLines: number };

export async function readImport(form: FormData): Promise<ImportInput> {
  const type = String(form.get("type") ?? "") as ReportType;
  const file = form.get("file");
  const agentId = type === "commissions" ? "" : String(form.get("agentId") ?? "").trim();
  let coverageStart = String(form.get("coverageStart") ?? "");
  let coverageEnd = String(form.get("coverageEnd") ?? "");
  // Historical Booking imports remain readable, but new imports use the
  // customer's Commission Payout export as the outcome source.
  if (!["leads", "ads", "commissions"].includes(type)) throw new Error("This report type is no longer available for import.");
  if (!(file instanceof File) || (type === "commissions" ? !/\.(csv|xlsx|xls)$/i.test(file.name) : !/\.(xlsx|xls)$/i.test(file.name))) throw new Error(type === "commissions" ? "Choose the Propwealth commission CSV or Excel export." : "Choose an Excel workbook.");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("File must be under 10 MB.");
  if ((type === "leads" || type === "ads") && !isLeadAgentId(agentId)) throw new Error("Select a valid Agent ID for this report.");
  const bytes = await file.arrayBuffer();
  const rows = parseWorkbook(bytes, type, agentId);
  if (!rows.length) throw new Error("The workbook contains no data rows.");
  if (type === "commissions" && !coverageStart && !coverageEnd) {
    const dates = rows.flatMap(row => [row.eventDate, row.data.latestSourceDate]).filter((date): date is string => typeof date === "string").sort();
    coverageStart = dates[0] ?? "";
    coverageEnd = dates.at(-1) ?? "";
  }
  if (!validDate(coverageStart) || !validDate(coverageEnd) || coverageStart > coverageEnd) throw new Error("Enter a valid report coverage start and end date.");
  if (rows.length > 1500) throw new Error("This MVP supports up to 1,500 rows per atomic import. Split larger reports into dated files.");
  const sourceLines = type === "commissions" ? rows.reduce((sum, row) => sum + Number(row.data.lineCount ?? (row.issue ? 1 : 0)), 0) : rows.length;
  return { type, file, agentId, coverageStart, coverageEnd, bytes, hash: await sha256(bytes), rows, sourceLines };
}

const chunks = <T,>(values: T[], count: number) => Array.from({ length: Math.ceil(values.length / count) }, (_, index) => values.slice(index * count, (index + 1) * count));

export async function inspectImport(input: ImportInput) {
  const seen = new Set<string>();
  const errors: { fileRow: number; issue: string }[] = [];
  const usable: ParsedRow[] = [];
  let outOfRangeRows = 0;
  let excludedRows = 0;
  let duplicateRows = 0;
  for (const row of input.rows) {
    if (row.excluded) { excludedRows++; continue; }
    if (row.issue) { errors.push({ fileRow: row.fileRow, issue: row.issue }); continue; }
    if (seen.has(row.recordId)) { duplicateRows++; errors.push({ fileRow: row.fileRow, issue: "Duplicate record ID within file" }); continue; }
    seen.add(row.recordId);
    if (row.eventDate! < input.coverageStart || row.eventDate! > input.coverageEnd || (input.type === "commissions" && typeof row.data.latestSourceDate === "string" && row.data.latestSourceDate > input.coverageEnd)) outOfRangeRows++;
    usable.push(row);
  }
  const existing = new Map<string, { agentId?: string | null }>();
  for (const group of chunks(usable, 90)) {
    const marks = group.map(() => "?").join(",");
    let query: string;
    let ids: string[];
    if (input.type === "leads") { query = `SELECT meta_lead_id id,assigned_agent_id agentId FROM leads WHERE meta_lead_id IN (${marks})`; ids = group.map(row => row.recordId); }
    else if (input.type === "bookings") { query = `SELECT booking_id id FROM bookings WHERE booking_id IN (${marks})`; ids = group.map(row => row.recordId); }
    else if (input.type === "commissions") { query = `SELECT DISTINCT s.sales_no id FROM commission_sales s JOIN import_batches b ON b.id=s.batch_id WHERE b.status='completed' AND s.sales_no IN (${marks})`; ids = group.map(row => row.recordId); }
    else { query = `SELECT a.day || ':' || a.ad_id id,b.agent_id agentId FROM ad_insights_daily a LEFT JOIN import_batches b ON b.id=a.current_source_batch_id WHERE a.day || ':' || a.ad_id IN (${marks})`; ids = group.map(row => row.recordId); }
    const result = await env.DB.prepare(query).bind(...ids).all<{ id: string; agentId?: string | null }>();
    for (const item of result.results) existing.set(item.id, item);
  }
  const conflicts = usable.filter(row => (input.type === "leads" || input.type === "ads") && existing.get(row.recordId)?.agentId && existing.get(row.recordId)?.agentId !== input.agentId)
    .map(row => ({ fileRow: row.fileRow, recordId: row.recordId, assignedAgentId: existing.get(row.recordId)?.agentId }));
  const duplicate = await env.DB.prepare(`SELECT id,coverage_start coverageStart,coverage_end coverageEnd,agent_id agentId FROM import_batches WHERE type=? AND file_hash=? AND status='completed' ORDER BY id DESC LIMIT 1`)
    .bind(input.type, input.hash).first<{ id: number; coverageStart: string; coverageEnd: string; agentId: string | null }>();
  return { totalRows: input.sourceLines, validRows: usable.length, excludedRows, errorRows: errors.length, outOfRangeRows, duplicateRows,
    dateVariationRows: input.type === "commissions" ? usable.filter(row => row.data.dateVariation === true).length : 0,
    createdRows: usable.filter(row => !existing.has(row.recordId)).length, updatedRows: usable.filter(row => existing.has(row.recordId)).length,
    errors, conflicts, duplicateBatch: duplicate, usable, existing };
}

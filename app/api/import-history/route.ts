import { env } from "cloudflare:workers";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { validDate } from "@/lib/import-workbook";
import { csvText } from "@/lib/csv";
import { isLeadAgentId } from "@/lib/lead-agent-options";
import { activeRowsDeleteSql } from "@/lib/import-removal";

type ImportRow = Record<string, string | number | null>;

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid import ID." }, { status: 400 });
    const batch = await env.DB.prepare(`SELECT b.*,u.email uploaded_by_email FROM import_batches b LEFT JOIN admin_users u ON u.id=b.uploaded_by WHERE b.id=?`).bind(Number(id)).first();
    if (!batch) return Response.json({ error: "Import not found." }, { status: 404 });
    const rows = await env.DB.prepare(`SELECT file_row fileRow,record_type recordType,record_id recordId,action,error FROM import_batch_rows WHERE batch_id=? ORDER BY file_row`).bind(Number(id)).all();
    return Response.json({ batch, rows: rows.results });
  }
  const type = url.searchParams.get("type") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const format = url.searchParams.get("format") ?? "";
  if (type && !["leads","ads","bookings","commissions"].includes(type)) return Response.json({ error: "Invalid report type." }, { status: 400 });
  if (status && !["processing","completed","failed","removed"].includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
  if ((from && !validDate(from)) || (to && !validDate(to))) return Response.json({ error: "Invalid date." }, { status: 400 });
  if (format && format !== "csv") return Response.json({ error: "Invalid format." }, { status: 400 });
  const query = `SELECT b.id,b.type,b.file_name fileName,b.status,b.total_rows totalRows,b.valid_rows validRows,b.error_rows errorRows,b.created_rows createdRows,b.updated_rows updatedRows,b.duplicate_rows duplicateRows,b.out_of_range_rows outOfRangeRows,b.coverage_start coverageStart,b.coverage_end coverageEnd,b.agent_id agentId,b.file_hash fileHash,b.storage_key storageKey,b.message,b.created_at createdAt,b.completed_at completedAt,u.email uploadedByEmail,(SELECT COUNT(*) FROM ad_insights_daily a WHERE a.current_source_batch_id=b.id) effectiveAdsRows FROM import_batches b LEFT JOIN admin_users u ON u.id=b.uploaded_by WHERE (?='' OR b.type=?) AND (?='' OR b.status=?) AND (?='' OR b.coverage_end>=?) AND (?='' OR b.coverage_start<=?) ORDER BY b.id DESC`;
  const filters = [type,type,status,status,from,from,to,to];
  if (format === "csv") {
    const rows: ImportRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await env.DB.prepare(`${query} LIMIT 500 OFFSET ?`).bind(...filters,offset).all<ImportRow>();
      rows.push(...page.results);
      if (page.results.length < 500) break;
      if (offset >= 99_500) return Response.json({ error: "Export exceeds 100,000 rows. Narrow the filters." }, { status: 400 });
    }
    const headers = ["id","type","fileName","status","totalRows","validRows","errorRows","createdRows","updatedRows","duplicateRows","outOfRangeRows","coverageStart","coverageEnd","agentId","effectiveAdsRows","uploadedByEmail","createdAt","completedAt","fileHash","originalFileAvailable","message","generatedAt"];
    const generatedAt = new Date().toISOString();
    const body = csvText(headers,rows.map(row => headers.map(header => header === "originalFileAvailable" ? (row.storageKey ? "Yes" : "No") : header === "generatedAt" ? generatedAt : row[header])));
    await audit(auth.admin.id,"csv_export",`import-history type=${type || "all"} status=${status || "all"} from=${from || "all"} to=${to || "all"} rows=${rows.length}`,request);
    return new Response(body,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=\"propwealth-import-history.csv\"","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
  const result = await env.DB.prepare(`${query} LIMIT 500`).bind(...filters).all();
  return Response.json({ imports: result.results });
}

// Existing Ads imports predate agent selection. The administrator can label
// the archived batch without altering the original workbook or its row data.
export async function PATCH(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  let input: { id?: number; agentId?: string };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const id = Number(input.id);
  const agentId = String(input.agentId ?? "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !isLeadAgentId(agentId)) return Response.json({ error: "Select a valid Ads batch and Agent ID." }, { status: 400 });
  const batch = await env.DB.prepare("SELECT id,type,status,agent_id agentId FROM import_batches WHERE id=?").bind(id).first<{ id:number; type:string; status:string; agentId:string|null }>();
  if (!batch || batch.type !== "ads" || batch.status !== "completed") return Response.json({ error: "Completed Ads batch not found." }, { status: 404 });
  const effective = await env.DB.prepare("SELECT COUNT(*) count FROM ad_insights_daily WHERE current_source_batch_id=?").bind(id).first<{count:number}>();
  if (!effective?.count) return Response.json({ error: "This Ads batch has no current records. Update the latest effective batch instead." }, { status: 409 });
  if (batch.agentId !== agentId) {
    await env.DB.prepare("UPDATE import_batches SET agent_id=? WHERE id=?").bind(agentId,id).run();
    await audit(auth.admin.id,"ads_agent_updated",`batch=${id} ${batch.agentId ?? "unassigned"} -> ${agentId}`,request);
  }
  return Response.json({ ok:true, id, agentId });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  let input: { id?: number; fileName?: string };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const id = Number(input.id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Invalid import ID." }, { status: 400 });
  const batch = await env.DB.prepare("SELECT id,type,file_name fileName,status,storage_key storageKey FROM import_batches WHERE id=?")
    .bind(id).first<{ id:number; type:keyof typeof activeRowsDeleteSql; fileName:string; status:string; storageKey:string|null }>();
  if (!batch || batch.status !== "completed") return Response.json({ error: "Only a completed import can be removed." }, { status: 409 });
  if (!batch.storageKey) return Response.json({ error: "This import has no archived original. Removal is disabled to protect its data." }, { status: 409 });
  if (!Object.hasOwn(activeRowsDeleteSql,batch.type) || input.fileName !== batch.fileName) return Response.json({ error: "File name confirmation does not match the selected import." }, { status: 400 });
  const note = `Removed from active data on ${new Date().toISOString()} by admin #${auth.admin.id}; original file retained privately.`;
  const results = await env.DB.batch([
    env.DB.prepare("UPDATE import_batches SET status='removed',message=COALESCE(message || ' ', '') || ? WHERE id=? AND status='completed'").bind(note,id),
    env.DB.prepare(activeRowsDeleteSql[batch.type]).bind(id),
    env.DB.prepare("INSERT INTO admin_audit(admin_id,action,detail,ip) VALUES(?,?,?,?)")
      .bind(auth.admin.id,"import_removed",`${batch.type} batch=${id} file=${batch.fileName}`,request.headers.get("CF-Connecting-IP") ?? null),
  ]);
  return Response.json({ ok:true,id,removedRows:results[1].meta.changes ?? 0,originalRetained:true });
}

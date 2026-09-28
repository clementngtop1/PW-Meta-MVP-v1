import { env } from "cloudflare:workers";
import { audit, requireAdmin } from "@/lib/admin-auth";
import { inspectImport, readImport } from "@/lib/import-service";

const columns = {
  leads: ["meta_lead_id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name", "campaign_id", "campaign_name", "form_id", "form_name", "platform", "purpose", "income_range", "full_name", "phone", "city", "email", "meta_status", "assigned_agent_id", "assigned_at", "is_test", "current_source_batch_id"],
  ads: ["day", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "result_type", "results", "spend", "impressions", "reach", "link_clicks", "current_source_batch_id"],
  bookings: ["booking_id", "meta_lead_id", "agent_id", "project_id", "unit_id", "booking_date", "booking_status", "sale_status", "sale_date", "cancelled_date", "selling_price", "estimated_commission", "paid_commission", "commission_payout_date", "updated_at", "current_source_batch_id"],
} as const;

const fields = {
  leads: ["metaLeadId", "createdTime", "adId", "adName", "adsetId", "adsetName", "campaignId", "campaignName", "formId", "formName", "platform", "purpose", "incomeRange", "fullName", "phone", "city", "email", "metaStatus", "assignedAgentId", "assignedAt", "isTest", "currentSourceBatchId"],
  ads: ["day", "campaignId", "campaignName", "adsetId", "adsetName", "adId", "resultType", "results", "spend", "impressions", "reach", "linkClicks", "currentSourceBatchId"],
  bookings: ["bookingId", "metaLeadId", "agentId", "projectId", "unitId", "bookingDate", "bookingStatus", "saleStatus", "saleDate", "cancelledDate", "sellingPrice", "estimatedCommission", "paidCommission", "commissionPayoutDate", "updatedAt", "currentSourceBatchId"],
} as const;

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  let batchId: number | null = null;
  try {
    const form = await request.formData();
    const input = await readImport(form);
    const previewHash = String(form.get("previewHash") ?? "");
    if (previewHash !== input.hash) return Response.json({ error: "File changed after preview. Preview this exact workbook again." }, { status: 400 });
    const review = await inspectImport(input);
    if (review.duplicateBatch) {
      if (review.duplicateBatch.agentId !== (input.agentId || null) || review.duplicateBatch.coverageStart !== input.coverageStart || review.duplicateBatch.coverageEnd !== input.coverageEnd)
        return Response.json({ error: "This exact file was already imported with different batch metadata. Review the earlier import." }, { status: 409 });
      await audit(auth.admin.id, "import_duplicate", `${input.type} batch=${review.duplicateBatch.id}`, request);
      return Response.json({ ok: true, duplicate: true, batchId: review.duplicateBatch.id, validRows: 0 });
    }
    if (review.conflicts.length) return Response.json({ error: `${input.type === "ads" ? "Ad day" : "Lead"} ${review.conflicts[0].recordId} is assigned to another agent. No records imported.`, conflicts: review.conflicts }, { status: 409 });
    if (review.outOfRangeRows && form.get("confirmOutOfRange") !== "true") return Response.json({ error: "Confirm the rows outside the declared coverage period before importing." }, { status: 400 });
    if (!review.validRows) return Response.json({ error: "No valid rows to import." }, { status: 400 });
    const archive = env.IMPORT_ARCHIVE;
    if (!archive) return Response.json({ error: "Private R2 archive is not configured. Import was not started." }, { status: 503 });
    const extension = input.file.name.toLowerCase().match(/\.(csv|xlsx|xls)$/)?.[0] ?? ".xlsx";
    const storageKey = `imports/${new Date().getUTCFullYear()}/${crypto.randomUUID()}${extension}`;
    const created = await env.DB.prepare(`INSERT INTO import_batches(type,file_name,status,total_rows,valid_rows,error_rows,coverage_start,coverage_end,agent_id,file_hash,storage_key,uploaded_by,created_rows,updated_rows,duplicate_rows,out_of_range_rows,message) VALUES(?,?,'processing',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(input.type, input.file.name, review.totalRows, review.validRows, review.errorRows, input.coverageStart, input.coverageEnd, input.agentId || null, input.hash, storageKey,
        auth.admin.id, review.createdRows, review.updatedRows, review.duplicateRows, review.outOfRangeRows, input.type === "commissions" ? `${review.validRows} Sales No snapshots from ${review.totalRows} payout lines. Amounts are not verified paid.` : review.excludedRows ? `${review.excludedRows} test rows excluded` : null).run();
    batchId = Number(created.meta.last_row_id);
    await archive.put(storageKey, input.bytes, { httpMetadata: { contentType: extension === ".csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }, customMetadata: { sha256: input.hash, type: input.type } });
    if (input.type === "commissions") {
      // Stage sale snapshots under the processing batch. Readers only use completed batches,
      // so a failed chunk never becomes an effective partial import.
      const allowedRows = new Set(review.usable.map(row => row.fileRow));
      const statements: D1PreparedStatement[] = [];
      for (const row of input.rows) {
        if (allowedRows.has(row.fileRow)) {
          const data = row.data;
          statements.push(env.DB.prepare(`INSERT INTO commission_sales(batch_id,sales_no,source_date,project_name,unit_number,line_count,agent_codes,gross_commission_amount,details_json) VALUES(?,?,?,?,?,?,?,?,?)`)
            .bind(batchId, data.salesNo, data.sourceDate, data.projectName, data.unitNumber, data.lineCount, data.agentCodes, data.grossCommissionAmount, data.detailsJson));
        }
        statements.push(env.DB.prepare(`INSERT INTO import_batch_rows(batch_id,record_type,record_id,file_row,action,error) VALUES(?, 'commissions', ?, ?, ?, ?)`)
          .bind(batchId, row.recordId || null, row.fileRow, allowedRows.has(row.fileRow) ? review.existing.has(row.recordId) ? "updated" : "created" : "skipped", row.issue ?? null));
      }
      for (let index = 0; index < statements.length; index += 75) await env.DB.batch(statements.slice(index, index + 75));
      await env.DB.prepare(`UPDATE import_batches SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(batchId).run();
      await audit(auth.admin.id, "import_completed", `commissions batch=${batchId} hash=${input.hash}`, request);
      return Response.json({ ok: true, batchId, totalRows: review.totalRows, validRows: review.validRows, errorRows: review.errorRows, outOfRangeRows: review.outOfRangeRows });
    }
    const table = input.type === "leads" ? "leads" : input.type === "ads" ? "ad_insights_daily" : "bookings";
    const names: readonly string[] = columns[input.type];
    const keys: readonly string[] = fields[input.type];
    const conflict = input.type === "leads" ? "meta_lead_id" : input.type === "ads" ? "day,ad_id" : "booking_id";
    const insert = `INSERT INTO ${table}(${names.join(",")}) VALUES(${names.map(() => "?").join(",")}) ON CONFLICT(${conflict}) DO UPDATE SET ${names.slice(1).map(name => `${name}=excluded.${name}`).join(",")},imported_at=CURRENT_TIMESTAMP`;
    const statements: D1PreparedStatement[] = [];
    const allowedRows = new Set(review.usable.map(row => row.fileRow));
    for (const row of input.rows) {
      if (!allowedRows.has(row.fileRow)) {
        const issue = row.excluded ? "Test lead excluded" : review.errors.find(item => item.fileRow === row.fileRow)?.issue ?? row.issue ?? "Skipped";
        statements.push(env.DB.prepare(`INSERT INTO import_batch_rows(batch_id,record_type,record_id,file_row,action,error) VALUES(?,?,?,?,'skipped',?)`).bind(batchId, input.type, row.recordId || null, row.fileRow, issue));
        continue;
      }
      const values: Record<string, string | number | boolean | null | undefined> = { ...row.data, currentSourceBatchId: batchId };
      statements.push(env.DB.prepare(insert).bind(...keys.map(key => values[key] ?? null)));
      statements.push(env.DB.prepare(`INSERT INTO import_batch_rows(batch_id,record_type,record_id,file_row,action) VALUES(?,?,?,?,?)`)
        .bind(batchId, input.type, row.recordId, row.fileRow, review.existing.has(row.recordId) ? "updated" : "created"));
    }
    statements.push(env.DB.prepare(`UPDATE import_batches SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(batchId));
    await env.DB.batch(statements);
    await audit(auth.admin.id, "import_completed", `${input.type} batch=${batchId} hash=${input.hash}`, request);
    return Response.json({ ok: true, batchId, totalRows: review.totalRows, validRows: review.validRows, errorRows: review.errorRows, outOfRangeRows: review.outOfRangeRows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    if (batchId) await env.DB.prepare(`UPDATE import_batches SET status='failed',message=? WHERE id=?`).bind(message.slice(0, 1000), batchId).run().catch(() => undefined);
    return Response.json({ error: message }, { status: 500 });
  }
}

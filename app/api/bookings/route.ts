import { env } from "cloudflare:workers";
import { requireAdmin } from "@/lib/admin-auth";
import { reportDates } from "@/lib/report-data";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  if (!env.DB) return Response.json({ error: "Database unavailable" }, { status: 503 });
  const url = new URL(request.url);
  let from = "0000-01-01", to = "9999-12-31";
  if (url.searchParams.has("from") || url.searchParams.has("to")) { try { ({from,to} = reportDates(url)); } catch { return Response.json({error:"Invalid date range."},{status:400}); } }
  const result = await env.DB.prepare(`SELECT o.booking_id bookingId,COALESCE(o.meta_lead_id,x.meta_lead_id) metaLeadId,o.agent_id agentId,o.project_id projectId,o.unit_id unitId,o.booking_date bookingDate,o.booking_status bookingStatus,o.sale_status saleStatus,o.selling_price sellingPrice,o.estimated_commission estimatedCommission,o.paid_commission paidCommission,o.updated_at updatedAt,o.current_source_batch_id sourceBatchId,b.file_name sourceFileName FROM bookings o LEFT JOIN import_batches b ON b.id=o.current_source_batch_id LEFT JOIN sale_lead_links x ON x.sales_no=o.booking_id WHERE o.booking_date BETWEEN ? AND ? ORDER BY o.booking_date DESC LIMIT 100`).bind(from,to).all();
  return Response.json({ bookings: result.results });
}

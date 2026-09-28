import { env } from "cloudflare:workers";
import { audit, requireAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const id = new URL(request.url).pathname.match(/\/import-history\/(\d+)\/file$/)?.[1];
  if (!id) return Response.json({ error: "Invalid import ID." }, { status: 400 });
  const batch = await env.DB.prepare(`SELECT file_name fileName,storage_key storageKey FROM import_batches WHERE id=?`).bind(Number(id)).first<{ fileName:string; storageKey:string|null }>();
  if (!batch?.storageKey) return Response.json({ error: "Original file unavailable. This may be a legacy import." }, { status: 404 });
  const object = await env.IMPORT_ARCHIVE.get(batch.storageKey);
  if (!object) return Response.json({ error: "Archived file not found." }, { status: 404 });
  await audit(auth.admin.id, "original_download", `batch=${id}`, request);
  const safeName = batch.fileName.replace(/[\r\n"\\]/g, "_");
  return new Response(object.body, { headers: {
    "Content-Type": batch.fileName.toLowerCase().endsWith(".csv") ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(batch.fileName)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}

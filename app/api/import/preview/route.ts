import { requireAdmin } from "@/lib/admin-auth";
import { inspectImport, readImport } from "@/lib/import-service";

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    const input = await readImport(await request.formData());
    const review = await inspectImport(input);
    return Response.json({ totalRows:review.totalRows, validRows:review.validRows, excludedRows:review.excludedRows, errorRows:review.errorRows, outOfRangeRows:review.outOfRangeRows, duplicateRows:review.duplicateRows, dateVariationRows:review.dateVariationRows, createdRows:review.createdRows, updatedRows:review.updatedRows,
      errors: review.errors.slice(0,100), conflicts: review.conflicts.slice(0,100), duplicateBatch:review.duplicateBatch, fileHash: input.hash, fileName: input.file.name, coverageStart: input.coverageStart, coverageEnd: input.coverageEnd });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to preview workbook" }, { status: 400 });
  }
}

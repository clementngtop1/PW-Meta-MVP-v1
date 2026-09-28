// Keep the preview and CSV on the same agent-specific, direct-commission basis.
// A Sales No can contain payout lines for several people, so sale-wide totals
// must not be presented as the selected agent's commission.
export const agentCommissionSalesSql = `WITH ranked AS (
    SELECT s.*,ROW_NUMBER() OVER(PARTITION BY s.sales_no ORDER BY b.completed_at DESC,b.id DESC) version
    FROM commission_sales s JOIN import_batches b ON b.id=s.batch_id WHERE b.status='completed'
  )
  SELECT s.sales_no salesNo,s.source_date sourceDate,s.project_name projectName,s.unit_number unitNumber,
    COUNT(*) lineCount,UPPER(TRIM(json_extract(line.value,'$.agentCode'))) agentCode,
    SUM(CAST(json_extract(line.value,'$.commissionAmount') AS REAL)) commissionAmount,
    s.batch_id sourceBatchId,b.file_name sourceFileName,b.coverage_start sourceCoverageStart,b.coverage_end sourceCoverageEnd
  FROM ranked s JOIN import_batches b ON b.id=s.batch_id JOIN json_each(s.details_json) line
  WHERE s.version=1 AND s.source_date BETWEEN ? AND ?
    AND UPPER(TRIM(json_extract(line.value,'$.agentCode')))=?
    AND LOWER(TRIM(json_extract(line.value,'$.commissionType')))='commission'
  GROUP BY s.sales_no,s.source_date,s.project_name,s.unit_number,s.batch_id,b.file_name,b.coverage_start,b.coverage_end
  ORDER BY s.source_date DESC,s.sales_no DESC`;

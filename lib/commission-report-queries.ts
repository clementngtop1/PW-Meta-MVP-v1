// The overview and campaign view describe source activity only. Agent ROI is
// calculated separately from monthly Ads and commission payout lines.
export const summarySql = `SELECT
  (SELECT COUNT(*) FROM leads WHERE is_test=0 AND date(created_time) BETWEEN ? AND ?) leads,
  (SELECT COALESCE(SUM(spend),0) FROM ad_insights_daily WHERE day BETWEEN ? AND ?) spend,
  (SELECT COUNT(*) FROM ad_insights_daily WHERE day BETWEEN ? AND ?) adRows,
  (SELECT COALESCE(SUM(impressions),0) FROM ad_insights_daily WHERE day BETWEEN ? AND ?) impressions,
  (SELECT COALESCE(SUM(link_clicks),0) FROM ad_insights_daily WHERE day BETWEEN ? AND ?) clicks,
  (SELECT COUNT(*) FROM leads WHERE is_test=0 AND date(created_time) BETWEEN ? AND ? AND current_source_batch_id IS NULL) legacyLeads`;

export const campaignSql = `WITH
  a AS (SELECT campaign_id,MAX(campaign_name) campaign_name,SUM(spend) spend
    FROM ad_insights_daily WHERE day BETWEEN ? AND ? GROUP BY campaign_id),
  l AS (SELECT campaign_id,MAX(campaign_name) campaign_name,COUNT(*) leads
    FROM leads WHERE is_test=0 AND date(created_time) BETWEEN ? AND ? GROUP BY campaign_id),
  ids AS (SELECT campaign_id FROM a UNION SELECT campaign_id FROM l)
  SELECT ids.campaign_id campaignId,COALESCE(l.campaign_name,a.campaign_name,'Unknown') campaignName,
    a.spend,COALESCE(l.leads,0) leads
  FROM ids LEFT JOIN a ON a.campaign_id IS ids.campaign_id
    LEFT JOIN l ON l.campaign_id IS ids.campaign_id
  ORDER BY COALESCE(a.spend,0) DESC`;

// Each Sales No may be re-imported. Only the latest completed snapshot counts;
// its individual payout lines retain their own dates and agent codes.
export const monthlyAgentRoiSql = `WITH ranked AS (
    SELECT s.*,ROW_NUMBER() OVER(PARTITION BY s.sales_no ORDER BY b.completed_at DESC,b.id DESC) version
    FROM commission_sales s JOIN import_batches b ON b.id=s.batch_id WHERE b.status='completed'
  ), payout AS (
    SELECT substr(json_extract(line.value,'$.payoutDate'),1,7) month,
      UPPER(TRIM(json_extract(line.value,'$.agentCode'))) agentId,
      COUNT(*) commissionLines,
      COUNT(DISTINCT s.sales_no) sales,
      GROUP_CONCAT(DISTINCT s.batch_id) commissionBatchIds,
      SUM(CAST(json_extract(line.value,'$.commissionAmount') AS REAL)) commission
    FROM ranked s JOIN json_each(s.details_json) line
    WHERE s.version=1 AND LOWER(TRIM(json_extract(line.value,'$.commissionType')))='commission'
      AND json_extract(line.value,'$.payoutDate') BETWEEN ? AND ?
    GROUP BY month,agentId
  ), ads AS (
    SELECT substr(a.day,1,7) month,UPPER(TRIM(b.agent_id)) agentId,
      COUNT(*) adRows,SUM(a.spend) spend,GROUP_CONCAT(DISTINCT b.id) adsBatchIds
    FROM ad_insights_daily a JOIN import_batches b ON b.id=a.current_source_batch_id
    WHERE b.status='completed' AND b.type='ads' AND b.agent_id IS NOT NULL
      AND a.day BETWEEN ? AND ? GROUP BY month,agentId
  ), lead_counts AS (
    SELECT substr(created_time,1,7) month,UPPER(TRIM(assigned_agent_id)) agentId,COUNT(*) leads
    FROM leads WHERE is_test=0 AND assigned_agent_id IS NOT NULL
      AND date(created_time) BETWEEN ? AND ? GROUP BY month,agentId
  ), keys AS (
    SELECT month,agentId FROM payout UNION SELECT month,agentId FROM ads UNION SELECT month,agentId FROM lead_counts
  )
  SELECT k.month,k.agentId,COALESCE(l.leads,0) leads,
    COALESCE(a.adRows,0) adRows,COALESCE(a.spend,0) spend,
    COALESCE(p.sales,0) sales,COALESCE(p.commissionLines,0) commissionLines,
    COALESCE(p.commission,0) commission,a.adsBatchIds,p.commissionBatchIds
  FROM keys k LEFT JOIN payout p ON p.month=k.month AND p.agentId=k.agentId
    LEFT JOIN ads a ON a.month=k.month AND a.agentId=k.agentId
    LEFT JOIN lead_counts l ON l.month=k.month AND l.agentId=k.agentId
  WHERE k.agentId IS NOT NULL AND k.agentId<>'' ORDER BY k.month,k.agentId`;

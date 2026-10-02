// Overview uses the same Agent Code scope for Leads, Ads, CPL and ROAS.
// Rows without an assigned Ads batch are surfaced separately, not silently
// attributed to an agent.
export const summarySql = `WITH
  selected_leads AS (
    SELECT l.* FROM leads l WHERE l.is_test=0 AND date(l.created_time) BETWEEN ? AND ?
      AND (?='' OR UPPER(TRIM(l.assigned_agent_id))=?)
  ), selected_ads AS (
    SELECT a.* FROM ad_insights_daily a JOIN import_batches b ON b.id=a.current_source_batch_id
    WHERE a.day BETWEEN ? AND ? AND b.status='completed' AND b.type='ads' AND b.agent_id IS NOT NULL AND TRIM(b.agent_id)<>''
      AND (?='' OR UPPER(TRIM(b.agent_id))=?)
  ), unassigned_ads AS (
    SELECT a.spend FROM ad_insights_daily a LEFT JOIN import_batches b ON b.id=a.current_source_batch_id
    WHERE a.day BETWEEN ? AND ? AND (b.id IS NULL OR b.status<>'completed' OR b.type<>'ads' OR b.agent_id IS NULL OR TRIM(b.agent_id)='')
  )
  SELECT (SELECT COUNT(*) FROM selected_leads) leads,
    (SELECT COALESCE(SUM(spend),0) FROM selected_ads) spend,
    (SELECT COUNT(*) FROM selected_ads) adRows,
    (SELECT COALESCE(SUM(impressions),0) FROM selected_ads) impressions,
    (SELECT COALESCE(SUM(link_clicks),0) FROM selected_ads) clicks,
    (SELECT COUNT(*) FROM selected_leads WHERE current_source_batch_id IS NULL) legacyLeads,
    (SELECT COUNT(*) FROM unassigned_ads) unassignedAdRows,
    (SELECT COALESCE(SUM(spend),0) FROM unassigned_ads) unassignedAdSpend`;

export const campaignSql = `WITH
  a AS (SELECT a.campaign_id,MAX(a.campaign_name) campaign_name,SUM(a.spend) spend
    FROM ad_insights_daily a JOIN import_batches b ON b.id=a.current_source_batch_id
    WHERE a.day BETWEEN ? AND ? AND b.status='completed' AND b.type='ads' AND b.agent_id IS NOT NULL AND TRIM(b.agent_id)<>''
      AND (?='' OR UPPER(TRIM(b.agent_id))=?) GROUP BY a.campaign_id),
  l AS (SELECT campaign_id,MAX(campaign_name) campaign_name,COUNT(*) leads
    FROM leads WHERE is_test=0 AND date(created_time) BETWEEN ? AND ?
      AND (?='' OR UPPER(TRIM(assigned_agent_id))=?) GROUP BY campaign_id),
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

// A removed batch stays in the audit trail and private archive, but its
// effective rows must leave the active tables so the same file can be tested
// and imported again.
export const activeRowsDeleteSql = {
  leads: "DELETE FROM leads WHERE current_source_batch_id=?",
  ads: "DELETE FROM ad_insights_daily WHERE current_source_batch_id=?",
  bookings: "DELETE FROM bookings WHERE current_source_batch_id=?",
  commissions: "DELETE FROM commission_sales WHERE batch_id=?",
} as const;

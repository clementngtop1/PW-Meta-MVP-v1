import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }), type: text("type").notNull(), fileName: text("file_name").notNull(),
  status: text("status").notNull().default("processing"), totalRows: integer("total_rows").notNull().default(0),
  validRows: integer("valid_rows").notNull().default(0), errorRows: integer("error_rows").notNull().default(0),
  message: text("message"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  coverageStart: text("coverage_start"), coverageEnd: text("coverage_end"), agentId: text("agent_id"),
  fileHash: text("file_hash"), storageKey: text("storage_key"), uploadedBy: integer("uploaded_by"),
  createdRows: integer("created_rows").notNull().default(0), updatedRows: integer("updated_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0), outOfRangeRows: integer("out_of_range_rows").notNull().default(0),
  completedAt: text("completed_at"),
});

export const leads = sqliteTable("leads", {
  metaLeadId: text("meta_lead_id").primaryKey(), createdTime: text("created_time").notNull(),
  adId: text("ad_id"), adName: text("ad_name"), adsetId: text("adset_id"), adsetName: text("adset_name"),
  campaignId: text("campaign_id"), campaignName: text("campaign_name"), formId: text("form_id"), formName: text("form_name"),
  platform: text("platform"), purpose: text("purpose"), incomeRange: text("income_range"), fullName: text("full_name"),
  phone: text("phone"), city: text("city"), email: text("email"), metaStatus: text("meta_status"),
  assignedAgentId: text("assigned_agent_id"), assignedAt: text("assigned_at"),
  isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`), currentSourceBatchId: integer("current_source_batch_id"),
}, (table) => [index("idx_leads_campaign_id").on(table.campaignId), index("idx_leads_ad_id").on(table.adId), index("idx_leads_assigned_agent_id").on(table.assignedAgentId)]);

export const adInsights = sqliteTable("ad_insights_daily", {
  id: integer("id").primaryKey({ autoIncrement: true }), day: text("day").notNull(),
  campaignId: text("campaign_id").notNull(), campaignName: text("campaign_name"), adsetId: text("adset_id").notNull(),
  adsetName: text("adset_name"), adId: text("ad_id").notNull(), resultType: text("result_type"),
  results: real("results").notNull().default(0), spend: real("spend").notNull().default(0),
  impressions: integer("impressions").notNull().default(0), reach: integer("reach").notNull().default(0),
  linkClicks: integer("link_clicks").notNull().default(0), importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  currentSourceBatchId: integer("current_source_batch_id"),
}, (table) => [uniqueIndex("uq_ad_insights_day_ad").on(table.day, table.adId), index("idx_ad_insights_campaign_day").on(table.campaignId, table.day)]);

export const bookings = sqliteTable("bookings", {
  bookingId: text("booking_id").primaryKey(), metaLeadId: text("meta_lead_id"), agentId: text("agent_id").notNull(),
  projectId: text("project_id").notNull(), unitId: text("unit_id").notNull(), bookingDate: text("booking_date").notNull(),
  bookingStatus: text("booking_status").notNull(), saleStatus: text("sale_status"), saleDate: text("sale_date"),
  cancelledDate: text("cancelled_date"), sellingPrice: real("selling_price").notNull().default(0),
  estimatedCommission: real("estimated_commission").notNull().default(0), paidCommission: real("paid_commission").notNull().default(0),
  commissionPayoutDate: text("commission_payout_date"), updatedAt: text("updated_at").notNull(),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`), currentSourceBatchId: integer("current_source_batch_id"),
}, (table) => [index("idx_bookings_meta_lead_id").on(table.metaLeadId), index("idx_bookings_agent_id").on(table.agentId)]);

// A commission export is a payout-line snapshot, not a Booking/Sale master record.
// Keep each Sales No snapshot attached to its import batch; failed batches are never displayed.
export const commissionSales = sqliteTable("commission_sales", {
  id: integer("id").primaryKey({ autoIncrement: true }), batchId: integer("batch_id").notNull(),
  salesNo: text("sales_no").notNull(), sourceDate: text("source_date").notNull(),
  projectName: text("project_name"), unitNumber: text("unit_number"),
  lineCount: integer("line_count").notNull(), agentCodes: text("agent_codes").notNull(),
  grossCommissionAmount: real("gross_commission_amount").notNull(), detailsJson: text("details_json").notNull(),
}, table => [uniqueIndex("uq_commission_sales_batch_sale").on(table.batchId, table.salesNo), index("idx_commission_sales_no").on(table.salesNo)]);

export const saleLeadLinks = sqliteTable("sale_lead_links", {
  salesNo: text("sales_no").primaryKey(), metaLeadId: text("meta_lead_id").notNull(),
  linkedBy: integer("linked_by").notNull(), linkedAt: text("linked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, table => [index("idx_sale_lead_links_meta_lead_id").on(table.metaLeadId)]);

export const adminUsers = sqliteTable("admin_users", {
  id: integer("id").primaryKey({ autoIncrement: true }), email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), passwordSalt: text("password_salt").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const adminSessions = sqliteTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(), adminId: integer("admin_id").notNull(),
  expiresAt: text("expires_at").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const loginAttempts = sqliteTable("login_attempts", {
  key: text("key").primaryKey(), count: integer("count").notNull(), windowStart: text("window_start").notNull(),
});

export const adminAudit = sqliteTable("admin_audit", {
  id: integer("id").primaryKey({ autoIncrement: true }), adminId: integer("admin_id"),
  action: text("action").notNull(), detail: text("detail"), ip: text("ip"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const importBatchRows = sqliteTable("import_batch_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }), batchId: integer("batch_id").notNull(),
  recordType: text("record_type").notNull(), recordId: text("record_id"), fileRow: integer("file_row").notNull(),
  action: text("action").notNull(), error: text("error"),
}, table => [index("idx_import_batch_rows_batch").on(table.batchId), index("idx_import_batch_rows_record").on(table.recordType, table.recordId)]);

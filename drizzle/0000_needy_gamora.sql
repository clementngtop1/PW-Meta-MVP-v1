CREATE TABLE `ad_insights_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`day` text NOT NULL,
	`campaign_id` text NOT NULL,
	`campaign_name` text,
	`adset_id` text NOT NULL,
	`adset_name` text,
	`ad_id` text NOT NULL,
	`result_type` text,
	`results` real DEFAULT 0 NOT NULL,
	`spend` real DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`reach` integer DEFAULT 0 NOT NULL,
	`link_clicks` integer DEFAULT 0 NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_ad_insights_day_ad` ON `ad_insights_daily` (`day`,`ad_id`);--> statement-breakpoint
CREATE INDEX `idx_ad_insights_campaign_day` ON `ad_insights_daily` (`campaign_id`,`day`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`booking_id` text PRIMARY KEY NOT NULL,
	`meta_lead_id` text,
	`agent_id` text NOT NULL,
	`project_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`booking_date` text NOT NULL,
	`booking_status` text NOT NULL,
	`sale_status` text,
	`sale_date` text,
	`cancelled_date` text,
	`selling_price` real DEFAULT 0 NOT NULL,
	`estimated_commission` real DEFAULT 0 NOT NULL,
	`paid_commission` real DEFAULT 0 NOT NULL,
	`commission_payout_date` text,
	`updated_at` text NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_meta_lead_id` ON `bookings` (`meta_lead_id`);--> statement-breakpoint
CREATE INDEX `idx_bookings_agent_id` ON `bookings` (`agent_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`file_name` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`valid_rows` integer DEFAULT 0 NOT NULL,
	`error_rows` integer DEFAULT 0 NOT NULL,
	`message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`meta_lead_id` text PRIMARY KEY NOT NULL,
	`created_time` text NOT NULL,
	`ad_id` text,
	`ad_name` text,
	`adset_id` text,
	`adset_name` text,
	`campaign_id` text,
	`campaign_name` text,
	`form_id` text,
	`form_name` text,
	`platform` text,
	`purpose` text,
	`income_range` text,
	`full_name` text,
	`phone` text,
	`city` text,
	`email` text,
	`meta_status` text,
	`assigned_agent_id` text,
	`assigned_at` text,
	`is_test` integer DEFAULT false NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leads_campaign_id` ON `leads` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_ad_id` ON `leads` (`ad_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_assigned_agent_id` ON `leads` (`assigned_agent_id`);--> statement-breakpoint
PRAGMA optimize;

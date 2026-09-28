CREATE TABLE `commission_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`sales_no` text NOT NULL,
	`source_date` text NOT NULL,
	`project_name` text,
	`unit_number` text,
	`line_count` integer NOT NULL,
	`agent_codes` text NOT NULL,
	`gross_commission_amount` real NOT NULL,
	`details_json` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_commission_sales_batch_sale` ON `commission_sales` (`batch_id`,`sales_no`);--> statement-breakpoint
CREATE INDEX `idx_commission_sales_no` ON `commission_sales` (`sales_no`);--> statement-breakpoint
CREATE TABLE `sale_lead_links` (
	`sales_no` text PRIMARY KEY NOT NULL,
	`meta_lead_id` text NOT NULL,
	`linked_by` integer NOT NULL,
	`linked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sale_lead_links_meta_lead_id` ON `sale_lead_links` (`meta_lead_id`);
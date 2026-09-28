CREATE TABLE `admin_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`admin_id` integer,
	`action` text NOT NULL,
	`detail` text,
	`ip` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`admin_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `admin_users_email_unique` ON `admin_users` (`email`);--> statement-breakpoint
CREATE TABLE `import_batch_rows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`record_type` text NOT NULL,
	`record_id` text,
	`file_row` integer NOT NULL,
	`action` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_import_batch_rows_batch` ON `import_batch_rows` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_import_batch_rows_record` ON `import_batch_rows` (`record_type`,`record_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ad_insights_daily` ADD `current_source_batch_id` integer;--> statement-breakpoint
ALTER TABLE `bookings` ADD `current_source_batch_id` integer;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `coverage_start` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `coverage_end` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `agent_id` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `file_hash` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `storage_key` text;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `uploaded_by` integer;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `created_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `updated_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `duplicate_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `out_of_range_rows` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `current_source_batch_id` integer;
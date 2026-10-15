CREATE TABLE `staff_logins` (
	`email` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `files` ADD `candidate_id` text;
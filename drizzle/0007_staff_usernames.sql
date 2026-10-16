ALTER TABLE staff_logins ADD COLUMN username TEXT;
--> statement-breakpoint
UPDATE staff_logins SET username=lower(email);
--> statement-breakpoint
CREATE UNIQUE INDEX staff_logins_username_unique ON staff_logins(username COLLATE NOCASE);

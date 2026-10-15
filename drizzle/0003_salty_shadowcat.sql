CREATE TABLE `ticket_counters` (
	`prefix` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_id_aliases` (
	`old_id` text PRIMARY KEY NOT NULL,
	`new_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_id_aliases_new_id_unique` ON `ticket_id_aliases` (`new_id`);--> statement-breakpoint
-- Preserve historical references while giving existing positions readable codes.
WITH classified AS (
 SELECT id AS old_id,
 CASE
 WHEN json_extract(data,'$.positionGroup') IN ('COE','HQ') THEN json_extract(data,'$.positionGroup')
 WHEN lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%software%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%develop%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%programmer%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%application%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%sales%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%client manager%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%account manager%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%solution%consultant%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%marketing%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%finance%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%human resource%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%people%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%project coordinator%' THEN 'HQ'
 WHEN lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%engineer%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%network%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%system%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%cloud%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%security%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%technical%'
   OR lower(coalesce(json_extract(data,'$.title'),'') || ' ' || coalesce(json_extract(data,'$.bu'),'')) LIKE '%service desk%' THEN 'COE'
 ELSE 'HQ' END AS prefix,coalesce(json_extract(data,'$.created'),'') AS created
 FROM tickets WHERE id NOT LIKE 'COE-%' AND id NOT LIKE 'HQ-%'
), numbered AS (
 SELECT *,row_number() OVER (PARTITION BY prefix ORDER BY created,old_id) AS n FROM classified
)
INSERT INTO ticket_id_aliases(old_id,new_id)
SELECT old_id,prefix||'-'||printf('%03d',n+coalesce((SELECT max(CAST(substr(t.id,length(prefix)+2) AS INTEGER)) FROM tickets t WHERE t.id LIKE prefix||'-%'),0)) FROM numbered;
--> statement-breakpoint
UPDATE files SET ticket_id=(SELECT new_id FROM ticket_id_aliases WHERE old_id=files.ticket_id) WHERE ticket_id IN (SELECT old_id FROM ticket_id_aliases);
--> statement-breakpoint
UPDATE events SET ticket_id=(SELECT new_id FROM ticket_id_aliases WHERE old_id=events.ticket_id) WHERE ticket_id IN (SELECT old_id FROM ticket_id_aliases);
--> statement-breakpoint
UPDATE notices SET ticket_id=(SELECT new_id FROM ticket_id_aliases WHERE old_id=notices.ticket_id) WHERE ticket_id IN (SELECT old_id FROM ticket_id_aliases);
--> statement-breakpoint
UPDATE tickets SET data=json_set(data,'$.legacyId',id,'$.id',(SELECT new_id FROM ticket_id_aliases WHERE old_id=tickets.id)),id=(SELECT new_id FROM ticket_id_aliases WHERE old_id=tickets.id),version=version+1 WHERE id IN (SELECT old_id FROM ticket_id_aliases);
--> statement-breakpoint
UPDATE tickets SET data=json_set(data,'$.positionGroup',CASE WHEN id LIKE 'COE-%' THEN 'COE' ELSE 'HQ' END);
--> statement-breakpoint
INSERT INTO ticket_counters(prefix,value) SELECT 'COE',coalesce(max(CAST(substr(id,5) AS INTEGER)),0) FROM tickets WHERE id LIKE 'COE-%';
--> statement-breakpoint
INSERT INTO ticket_counters(prefix,value) SELECT 'HQ',coalesce(max(CAST(substr(id,4) AS INTEGER)),0) FROM tickets WHERE id LIKE 'HQ-%';

DROP INDEX `ticket_id_aliases_new_id_unique`;
--> statement-breakpoint
UPDATE tickets SET data=json_set(data,'$.approvals',json('[{"name":"HR","email":"","done":false}]')),version=version+1 WHERE json_extract(data,'$.status')='Pending Approval';

--> statement-breakpoint
UPDATE config SET data=json_set(data,'$.extraApproval',json('false'),'$.positionCatalog',CASE WHEN coalesce(json_array_length(data,'$.positionCatalog'),0)=0 THEN json('["Team Lead - Network Security Engineer", "Network Security Engineer", "System Engineer – L1/L2", "Software Sales Manager", "Sales Specialist - Network Security", "Inside Sales Representative", "Software Developer", "Software Team Lead", "Project Coordinator / Associate"]') ELSE json_extract(data,'$.positionCatalog') END) WHERE id='workflow';

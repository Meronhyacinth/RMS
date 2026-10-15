UPDATE tickets SET data=json_set(data,'$.previousLocation',json_extract(data,'$.location'),'$.location',CASE WHEN id LIKE 'COE-%' THEN 'COE' ELSE 'HQ' END,'$.positionGroup',CASE
WHEN lower(json_extract(data,'$.title')) LIKE '%sales%' OR lower(json_extract(data,'$.title')) LIKE '%client manager%' OR lower(json_extract(data,'$.title')) LIKE '%account manager%' OR lower(json_extract(data,'$.title')) LIKE '%solution%consultant%' THEN 'Sales'
WHEN lower(json_extract(data,'$.title')) LIKE '%software%' OR lower(json_extract(data,'$.title')) LIKE '%develop%' OR lower(json_extract(data,'$.title')) LIKE '%programmer%' OR lower(json_extract(data,'$.title')) LIKE '%application%' THEN 'Software Team'
WHEN lower(json_extract(data,'$.title')) LIKE '%human resource%' OR lower(json_extract(data,'$.title')) LIKE '%hr %' OR lower(json_extract(data,'$.bu')) LIKE '%people%' THEN 'Human Resource'
WHEN lower(json_extract(data,'$.title')) LIKE '%finance%' OR lower(json_extract(data,'$.title')) LIKE '%accountant%' THEN 'Finance'
WHEN lower(json_extract(data,'$.title')) LIKE '%marketing%' THEN 'Marketing'
WHEN lower(json_extract(data,'$.title')) LIKE '%noc%' OR lower(json_extract(data,'$.title')) LIKE '%network operation%' OR lower(json_extract(data,'$.title')) LIKE '%service desk%' THEN 'NOC'
WHEN lower(json_extract(data,'$.title')) LIKE '%security%' OR lower(json_extract(data,'$.title')) LIKE '%netsec%' THEN 'NetSec Team'
WHEN lower(json_extract(data,'$.title')) LIKE '%engineer%' OR lower(json_extract(data,'$.title')) LIKE '%system%' OR lower(json_extract(data,'$.title')) LIKE '%cloud%' OR lower(json_extract(data,'$.title')) LIKE '%technical%' THEN 'SDT'
ELSE 'Operations' END),version=version+1;

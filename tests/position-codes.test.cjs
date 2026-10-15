const {DatabaseSync}=require('node:sqlite');
const {readFileSync,readdirSync}=require('node:fs');
const assert=require('node:assert/strict');
const db=new DatabaseSync(':memory:');
const migrations=readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort();
for(const file of migrations.filter(n=>n<'0003'))db.exec(readFileSync('drizzle/'+file,'utf8'));
for(const [id,title,bu] of [['RMS-A','Network Security Engineer','Engineering'],['RMS-B','Software Engineer','Technology'],['RMS-C','Sales Specialist - Network Security','Sales'],['RMS-D','System Engineer – L1/L2','Technology'],['COE-007','Existing Engineer','Engineering']]){
 db.prepare('INSERT INTO tickets VALUES (?,?,1,?)').run(id,JSON.stringify({id,title,bu,created:'2026-10-01',candidates:[{id:'candidate-1',documents:[{id:'file-1'}]}],interviews:[{id:'interview-1',candidateId:'candidate-1',feedback:'Retained'}]}),'fixture');
}
db.prepare('INSERT INTO files VALUES (?,?,?,?,?,?,?,?)').run('file-1','RMS-A','resume.pdf',10,'application/pdf','unchanged/private-key','hr@example.test','candidate-1');
db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?)').run('event-1','RMS-A','2026-10-01','HR','hr-id','Historic event');
db.prepare('INSERT INTO notices VALUES (?,?,?,?,?,?)').run('notice-1','lead@example.test','RMS-A','Interview scheduled','2026-10-01',0);
db.exec('BEGIN');db.exec(readFileSync('drizzle/'+migrations.find(n=>n.startsWith('0003')),'utf8'));db.exec('COMMIT');
assert.equal(db.prepare('SELECT new_id FROM ticket_id_aliases WHERE old_id=?').get('RMS-A').new_id,'COE-008');
assert.equal(db.prepare('SELECT new_id FROM ticket_id_aliases WHERE old_id=?').get('RMS-D').new_id,'COE-009');
assert.equal(db.prepare('SELECT new_id FROM ticket_id_aliases WHERE old_id=?').get('RMS-B').new_id,'HQ-001');
assert.equal(db.prepare('SELECT new_id FROM ticket_id_aliases WHERE old_id=?').get('RMS-C').new_id,'HQ-002');
for(const table of ['files','events','notices'])assert.equal(db.prepare('SELECT ticket_id FROM '+table+' LIMIT 1').get().ticket_id,'COE-008');
const t=JSON.parse(db.prepare('SELECT data FROM tickets WHERE id=?').get('COE-008').data);assert.equal(t.id,'COE-008');assert.equal(t.legacyId,'RMS-A');assert.equal(t.candidates[0].documents[0].id,'file-1');assert.equal(t.interviews[0].feedback,'Retained');
assert.equal(db.prepare('SELECT key FROM files').get().key,'unchanged/private-key');
for(const [prefix,expected] of [['COE',10],['HQ',3],['COE',11]])assert.equal(db.prepare('INSERT INTO ticket_counters(prefix,value) VALUES (?,1) ON CONFLICT(prefix) DO UPDATE SET value=ticket_counters.value+1 RETURNING value').get(prefix).value,expected);
db.exec(readFileSync('drizzle/0004_position_teams.sql','utf8'));const mapped=JSON.parse(db.prepare('SELECT data FROM tickets WHERE id=?').get('COE-008').data);assert.equal(mapped.positionGroup,'NetSec Team');assert.equal(mapped.location,'COE');const software=JSON.parse(db.prepare('SELECT data FROM tickets WHERE id=?').get('HQ-001').data);assert.equal(software.positionGroup,'Software Team');assert.equal(software.location,'HQ');assert.equal(software.candidates[0].id,'candidate-1');db.close();console.log('PASS: independent sequential position codes; legacy migration preserves candidate records, private file keys, notices, audit history and existing code ranges');

const {DatabaseSync}=require('node:sqlite');
const {readFileSync,readdirSync}=require('node:fs');
const assert=require('node:assert/strict');
const db=new DatabaseSync(':memory:');
for(const name of readdirSync('drizzle').filter(n=>n.endsWith('.sql')&&!n.startsWith('0006')&&!n.startsWith('0007')).sort())db.exec(readFileSync('drizzle/'+name,'utf8'));
for(const role of ['admin','requester','approver','interviewer','hr'])db.prepare('INSERT INTO members(email,name,role,active) VALUES (?,?,?,1)').run(role+'@example.test',role,role);
db.prepare('INSERT INTO staff_logins(email,password_hash,version) VALUES (?,?,?)').run('requester@example.test','existing-hash',3);
db.exec(readFileSync('drizzle/0006_three_access_roles.sql','utf8'));
const members=db.prepare('SELECT * FROM members').all();assert.equal(members.length,5);assert.equal(members.find(m=>m.email==='admin@example.test').role,'boss');assert.equal(members.find(m=>m.email==='hr@example.test').role,'hr');assert.equal(members.filter(m=>m.role==='team_lead').length,3);assert.equal(db.prepare('SELECT password_hash,version FROM staff_logins').get().version,3);assert.ok(members.every(m=>m.active===1));
console.log('PASS: existing accounts migrate to three roles without changing access status or staff passwords');

db.exec(readFileSync('drizzle/0007_staff_usernames.sql','utf8'));const login=db.prepare('SELECT * FROM staff_logins').get();assert.equal(login.username,'requester@example.test');assert.equal(login.password_hash,'existing-hash');assert.equal(login.version,3);console.log('PASS: username migration preserves existing email logins, hashes and session versions');

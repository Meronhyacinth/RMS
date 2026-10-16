import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {passwordLoginEnabled,hashPassword,verifyPassword,sessionCookie,logoutCookie,sessionUser,clearLegacyCookie} from './password-auth';
import {defaults,positionLocation,positionTeams,suggestPositionTeam,isHR,canViewCandidate,canView,permissions,safeTicket,validateInput,nextFor,allowedNext,terminal,recruitment, type Ticket,type Member} from './rules';

const OWNER_EMAIL=((env as unknown as {RMS_OWNER_EMAIL?:string}).RMS_OWNER_EMAIL||'').toLowerCase();
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
const db=()=>env.DB as D1Database;
const stmt=(sql:string,...args:any[])=>db().prepare(sql).bind(...args);
const clean=(s:any,max=2000)=>String(s??'').trim().slice(0,max);
const validEmail=(s:any)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s));
const iso=(s:any)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
async function member(req:Request){
 const passwordMode=passwordLoginEnabled();const u=passwordMode?await sessionUser(req):await getChatGPTUser();if(!u)fail('Sign in to RMS to use this workspace.',401);
 const email=u!.email.toLowerCase();
 // Only the verified Site owner can bootstrap administration; first visitor is never an admin.
 if(email===OWNER_EMAIL)await stmt('INSERT OR IGNORE INTO members (email,user_id,name,role,bu,active) VALUES (?,?,?,?,?,1)',email,u!.userId,u!.displayName,'boss','').run();
 const m=await stmt('SELECT * FROM members WHERE email=? AND active=1',email).first<Member>();
 if(passwordMode&&(u as any).authVersion!==undefined){const login=await stmt('SELECT version FROM staff_logins WHERE email=?',email).first<any>();if(!login||login.version!==(u as any).authVersion)fail('Your password changed. Please sign in again.',401);}
 if(!m||!['team_lead','hr','boss'].includes(m.role))fail('Your account has not been added to RMS. Ask the workspace administrator for access.',403);
 if(!passwordMode&&m!.user_id&&m!.user_id!==u!.userId)fail('Account identity does not match membership.',403);
 if(!m!.user_id)await stmt('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL',u!.userId,email).run();
 return {...m!,user_id:u!.userId};
}
async function configuration(){const r=await stmt('SELECT data FROM config WHERE id=?','workflow').first<any>();const config:any={...defaults,...(r?JSON.parse(r.data):{})};for(const key of ['hrSla','approvalSla','recruitmentSla','holidays'])delete config[key];return config;}
async function activeMember(email:string){return stmt('SELECT * FROM members WHERE email=? AND active=1',email).first<Member>();}
async function approvalRoute(t:Ticket,s:any){return [{name:'HR',email:'',done:false}];}

function payload(data:Ticket){const keys=['manager','managerEmail','positionGroup','title','bu','team','grade','vacancies','employment','duration','location','justification','target','priority','urgency','requirements','replacement','vacancyDate','type'];const o:Ticket={};for(const k of keys)o[k]=typeof data[k]==='string'?clean(data[k],['requirements','justification'].includes(k)?6000:200):data[k];o.vacancies=+o.vacancies;return o;}
function checkInput(t:Ticket,draft:boolean){validateInput(t,draft);if(draft)return;if(t.managerEmail&&!validEmail(t.managerEmail))fail('Enter a valid HOD email.');if(t.managerEmail)t.managerEmail=t.managerEmail.toLowerCase();if(!iso(t.target))fail('Choose a valid joining date.');if(t.type==='Replacement'&&!iso(t.vacancyDate))fail('Choose a valid vacancy date.');if(!['Permanent','Contract','Temporary','Internship'].includes(t.employment))fail('Choose an employment type.');}
async function record(t:Ticket,m:Member,text:string,version?:number,file?:any,deletedFileId?:string){
 const at=new Date().toISOString(),mutation=crypto.randomUUID();t.updatedAt=at;t.history??=[];t.history.push({at,actor:m.name,text});
 const statements=version===undefined?[stmt('INSERT INTO tickets (id,data,version,mutation) VALUES (?,?,1,?)',t.id,JSON.stringify(t),mutation)]:[stmt('UPDATE tickets SET data=?,version=version+1,mutation=? WHERE id=? AND version=?',JSON.stringify(t),mutation,t.id,version)];
 statements.push(stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',crypto.randomUUID(),t.id,at,m.name,m.user_id,text,t.id,mutation));
 if(file)statements.push(stmt('INSERT INTO files (id,ticket_id,name,size,mime,key,by,candidate_id) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',file.id,t.id,file.name,file.size,file.mime,file.key,m.email,file.candidateId||null,t.id,mutation));
 if(deletedFileId)statements.push(stmt('DELETE FROM files WHERE id=? AND EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',deletedFileId,t.id,mutation));
 const recipients=new Set([t.requesterEmail,t.ownerEmail,...(t.interviews||[]).map((i:any)=>i.interviewer),...(t.status==='Pending Approval'?[t.approvals.find((a:any)=>!a.done)?.email]:[])]);
 if(['Pending HR Review','Pending Approval','Approved'].includes(t.status)||text.startsWith('Interview scheduling requested')||text.startsWith('Candidate rejected')||text.startsWith('Candidate placed on hold')||text.startsWith('Candidate review resumed')||text.startsWith('Offer preparation requested')||(t.priority==='High'&&!terminal.includes(t.status)&&t.status!=='Draft')){const hr=await stmt("SELECT email FROM members WHERE active=1 AND role IN ('hr','boss')").all<any>();for(const person of hr.results)recipients.add(person.email);}
 for(const email of recipients)if(email)statements.push(stmt('INSERT INTO notices (id,email,ticket_id,text,at,read) SELECT ?,?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',crypto.randomUUID(),email,t.id,(t.priority==='High'?'HIGH PRIORITY · ':'')+text,at,t.id,mutation));
 const r=await db().batch(statements);if(!r[0].meta.changes)fail('This request changed in another session. Refresh and try again.',409);
}
async function getTicket(id:string,m:Member){const r=await stmt('SELECT * FROM tickets WHERE id=? OR id=(SELECT new_id FROM ticket_id_aliases WHERE old_id=?)',id,id).first<any>();if(!r)fail('Request not found.',404);const t=JSON.parse(r.data);if(!canView(m,t))fail('You do not have access to this request.',403);return {t,version:r.version};}
const requireHR=(m:Member)=>{if(!isHR(m))fail('Only HR can perform this action.',403)};

export async function handle(req:Request){try{
 const u=new URL(req.url),path=u.pathname.replace(/^\/api\/rms\/?/,'');
 if(req.method==='POST'&&req.headers.get('origin')&&req.headers.get('origin')!==u.origin)fail('Cross-origin changes are not allowed.',403);
 if(path==='login'&&req.method==='POST'){
  if(!passwordLoginEnabled())fail('Password login is not configured.',503);
  const ip=req.headers.get('cf-connecting-ip')||'unknown';const ipKey=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip)))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const now=Math.floor(Date.now()/1000);const row=await stmt('SELECT attempts,window_start FROM login_limits WHERE key=?',ipKey).first<any>();
  if(row&&now-row.window_start<900&&row.attempts>=10)fail('Too many login attempts. Try again in 15 minutes.',429);
  await stmt('INSERT INTO login_limits (key,attempts,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN ?-window_start>=900 THEN 1 ELSE attempts+1 END,window_start=CASE WHEN ?-window_start>=900 THEN ? ELSE window_start END',ipKey,now,now,now,now).run();
  const input=await req.json() as any,username=clean(input.username,254).toLowerCase();
  const staff=username==='admin'?null:await stmt('SELECT l.password_hash,l.version,m.email,m.name,m.active FROM staff_logins l JOIN members m ON m.email=l.email WHERE l.email=?',username).first<any>();
  const valid=typeof input.password==='string'&&input.password.length<=256&&await verifyPassword(input.password,username==='admin'?undefined:staff?.password_hash||'invalid');
  if(!valid||(username!=='admin'&&(!staff||!staff.active)))fail('Incorrect username or password.',401);
  await stmt('DELETE FROM login_limits WHERE key=?',ipKey).run();
  const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',clearLegacyCookie());headers.append('Set-Cookie',await sessionCookie(staff?{email:staff.email,name:staff.name,version:staff.version}:undefined));return Response.json({ok:true},{headers});
 }
 if(path==='logout'&&req.method==='POST'){const headers=new Headers({'Cache-Control':'no-store'});headers.append('Set-Cookie',clearLegacyCookie());headers.append('Set-Cookie',logoutCookie());return Response.json({ok:true},{headers});}
 const m=await member(req),s=await configuration();
 if(req.method==='GET'&&path==='workspace'){
  const rows=await stmt('SELECT data,version FROM tickets ORDER BY id DESC').all<any>();
  const ts=rows.results.map(r=>({...JSON.parse(r.data),version:r.version})).filter(t=>canView(m,t)).map(t=>safeTicket(t,m));
  const people=await stmt(isHR(m)?'SELECT email,name,role,bu,active FROM members ORDER BY name':'SELECT email,name,role,bu,active FROM members WHERE active=1 ORDER BY name').all();
  const notices=await stmt('SELECT * FROM notices WHERE email=? ORDER BY at DESC LIMIT 150',m.email).all();
  return json({member:m,settings:s,tickets:ts,members:people.results.map((person:any)=>({...person,isOwner:person.email===OWNER_EMAIL})),notices:notices.results.filter((n:any)=>ts.some(t=>t.id===n.ticket_id))});
 }
 if(req.method==='GET'&&path.startsWith('files/')){
  const f=await stmt('SELECT * FROM files WHERE id=?',path.slice(6)).first<any>();if(!f)fail('Attachment not found.',404);const {t}=await getTicket(f.ticket_id,m);if(f.candidate_id&&!isHR(m)&&(t.candidates||[]).find((c:any)=>c.id===f.candidate_id)?.documents?.some((d:any)=>d.id===f.id&&d.kind==='Offer letter'))fail('Offer letters are available to HR and Boss only.',403);if(f.candidate_id&&!canViewCandidate(m,t,f.candidate_id))fail('This candidate document is not assigned to you.',403);
  const obj=await env.BUCKET!.get(f.key);if(!obj)fail('Attachment not found.',404);
  const preview=u.searchParams.get('view')==='1'&&/\.pdf$/i.test(f.name);return new Response(obj!.body,{headers:{'Content-Security-Policy':"sandbox; default-src 'none'",'Content-Type':preview?'application/pdf':'application/octet-stream','Content-Disposition':`${preview?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method!=='POST')fail('Unknown operation.',404);
 if(path==='upload'){
  const form=await req.formData(),file=form.get('file') as File,id=String(form.get('ticketId')||'');
  if(!file||typeof file==='string'||!file.size||file.size>2*1024*1024)fail('Choose a nonempty file up to 2 MB.');
  if(!/\.(pdf|docx?|txt)$/i.test(file.name))fail('Use PDF, DOC, DOCX or TXT attachments.');
  const {t,version}=await getTicket(id,m);const candidateId=clean(form.get('candidateId'),100),candidate=candidateId?(t.candidates||[]).find((c:any)=>c.id===candidateId):null;if(candidateId&&(!isHR(m)||!candidate))fail('Only HR can attach documents to an existing candidate.',403);if(!(permissions(m,t).edit||isHR(m)))fail('You cannot attach files to this request.',403);
  const fid=crypto.randomUUID(),key=`tickets/${id}/${fid}`;await env.BUCKET!.put(key,await file.arrayBuffer());
  try{const attachment={id:fid,name:clean(file.name,180),size:file.size,kind:clean(form.get('kind'),40)||'Resume'};if(candidate){if(!['Resume','Cover letter','Offer letter','Other'].includes(attachment.kind))fail('Choose a valid document type.');candidate.documents??=[];candidate.documents.push(attachment);}else t.attachments.push(attachment);await record(t,m,candidate?'Candidate document added':'Attachment added: '+clean(file.name,180),version,{id:fid,name:clean(file.name,180),size:file.size,mime:file.type,key,candidateId});}catch(e){await env.BUCKET!.delete(key);throw e}
  return json({ok:true});
 }
 const body=await req.json() as any;
 if(path==='staff-password'){
  requireHR(m);const email=clean(body.email).toLowerCase();const target=await activeMember(email);if(m.role==='hr'&&target?.role!=='team_lead')fail('HR can set passwords for team leads only.',403);if(email===OWNER_EMAIL)fail('The bootstrap admin password is managed in server settings.');if(!await activeMember(email))fail('Select an active staff member.');if(typeof body.password!=='string'||body.password.length<12||body.password.length>256)fail('Use a password of 12–256 characters.');const hash=await hashPassword(body.password);await stmt('INSERT INTO staff_logins (email,password_hash,version) VALUES (?,?,1) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,version=staff_logins.version+1',email,hash).run();await stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),'WORKSPACE',new Date().toISOString(),m.name,m.user_id,'Staff password reset: '+email).run();return json({ok:true});
 }
 if(path==='members'){
  requireHR(m);const email=clean(body.email).toLowerCase();const existing=await stmt('SELECT role FROM members WHERE email=?',email).first<any>();if(m.role==='hr'&&(body.role!=='team_lead'||(existing&&existing.role!=='team_lead')))fail('HR can add or remove team leads only.',403);if(!validEmail(email)||!['team_lead','hr','boss'].includes(body.role)||!clean(body.name))fail('Enter a name, email and valid role.');
  if(email===OWNER_EMAIL&&(body.role!=='boss'||body.active===false))fail('The Site owner must remain an active boss.');
  await stmt('INSERT INTO members (email,name,role,bu,active) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,bu=excluded.bu,active=excluded.active',email,clean(body.name,100),body.role,clean(body.bu,100),body.active===false?0:1).run();
  await stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),'WORKSPACE',new Date().toISOString(),m.name,m.user_id,'Membership updated: '+email+' / '+body.role).run();return json({ok:true});
 }
 if(path==='settings'){
  requireHR(m);
  const config={...s,...body,extraApproval:false};for(const key of ['hrSla','approvalSla','recruitmentSla','holidays'])delete config[key];if(body.positionCatalog!==undefined){if(!Array.isArray(body.positionCatalog)||body.positionCatalog.length>300||body.positionCatalog.some((x:any)=>typeof x!=='string'||!x.trim()||x.length>100))fail('Use up to 300 position titles, each 1–100 characters.');config.positionCatalog=[...new Set(body.positionCatalog.map((x:string)=>x.trim()))];}for(const key of ['rejectTemplate','interviewTemplate']){if(body[key]!==undefined){const tpl=body[key];if(!tpl||typeof tpl.subject!=='string'||!tpl.subject.trim()||tpl.subject.length>200||typeof tpl.body!=='string'||!tpl.body.trim()||tpl.body.length>10000)fail('Enter a subject and body for each email template.');config[key]={subject:tpl.subject,body:tpl.body};}}for(const k of ['systemEmail','replyTo']){config[k]=clean(config[k],254).toLowerCase();if(config[k]&&!validEmail(config[k]))fail('Enter a valid '+(k==='systemEmail'?'recruitment':'reply-to')+' email address.');}config.senderName=clean(config.senderName||'Recruitment team',100);for(const k of ['escalationEmail']){config[k]=clean(config[k]).toLowerCase();if(config[k]&&!await activeMember(config[k]))fail('Select an active member for '+k+'.');}
  if(!['Offer accepted','Employee joined'].includes(config.closureRule))fail('Choose a valid Filled definition.');
  await stmt('INSERT INTO config (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data','workflow',JSON.stringify(config)).run();
  await stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),'WORKSPACE',new Date().toISOString(),m.name,m.user_id,'Workflow settings updated').run();return json({ok:true});
 }
 if(path==='read-notices'){await stmt('UPDATE notices SET read=1 WHERE email=?',m.email).run();return json({ok:true});}
 if(path==='create'){
  const t=payload(body.data);checkInput(t,true);t.positionGroup=t.positionGroup||suggestPositionTeam(t.title,t.bu);if(!positionTeams.includes(t.positionGroup))fail('Choose a valid position group / team.');t.location=t.location||positionLocation(t.title,t.bu);if(!['COE','HQ'].includes(t.location))fail('Location must be HQ or COE.');const prefix=t.location;const seq=await stmt('INSERT INTO ticket_counters (prefix,value) VALUES (?,1) ON CONFLICT(prefix) DO UPDATE SET value=ticket_counters.value+1 RETURNING value',prefix).first<any>();Object.assign(t,{id:prefix+'-'+String(seq.value).padStart(3,'0'),positionGroup:t.positionGroup,status:'Draft',requester:m.name,requesterEmail:m.email,owner:m.name,ownerEmail:m.email,created:new Date().toISOString().slice(0,10),next:nextFor('Draft'),due:'',attachments:[],approvals:[],comments:[],history:[],interviews:[],candidates:[],filledCount:0,salaryMin:null,salaryMax:null,budget:'TBD',costCentre:''});
  await record(t,m,'Draft created');return json({id:t.id});
 }
 const {t,version}=await getTicket(body.id,m);if(body.version!==version)fail('This request changed in another session. Refresh and try again.',409);
 if(path==='rename-position-id'){
  requireHR(m);const next=clean(body.newId,30).toUpperCase();if(!/^(COE|HQ)-[0-9]{3,}$/.test(next)||+next.split('-')[1]<1)fail('Use COE-001 or HQ-001 with a positive number.');if(next===t.id)return json({ok:true,id:t.id});if(await stmt('SELECT id FROM tickets WHERE id=?',next).first()||await stmt('SELECT old_id FROM ticket_id_aliases WHERE old_id=?',next).first())fail('That ID is already used or reserved.');const old=t.id,mutation=crypto.randomUUID(),at=new Date().toISOString();t.id=next;t.location=next.split('-')[0];t.updatedAt=at;t.history.push({at,actor:m.name,text:'Position ID changed from '+old+' to '+next});const q=[stmt('UPDATE tickets SET id=?,data=?,version=version+1,mutation=? WHERE id=? AND version=?',next,JSON.stringify(t),mutation,old,version)];for(const table of ['files','events','notices'])q.push(stmt('UPDATE '+table+' SET ticket_id=? WHERE ticket_id=? AND EXISTS(SELECT 1 FROM tickets WHERE id=? AND mutation=?)',next,old,next,mutation));q.push(stmt('UPDATE ticket_id_aliases SET new_id=? WHERE new_id=? AND EXISTS(SELECT 1 FROM tickets WHERE id=? AND mutation=?)',next,old,next,mutation));q.push(stmt('INSERT INTO ticket_id_aliases(old_id,new_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM tickets WHERE id=? AND mutation=?)',old,next,next,mutation));q.push(stmt('INSERT INTO events(id,ticket_id,at,actor,actor_id,text) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM tickets WHERE id=? AND mutation=?)',crypto.randomUUID(),next,at,m.name,m.user_id,'Position ID changed from '+old+' to '+next,next,mutation));q.push(stmt('INSERT INTO ticket_counters(prefix,value) SELECT ?,? WHERE EXISTS(SELECT 1 FROM tickets WHERE id=? AND mutation=?) ON CONFLICT(prefix) DO UPDATE SET value=max(value,excluded.value)',t.location,+next.split('-')[1],next,mutation));const result=await db().batch(q);if(!result[0].meta.changes)fail('This position changed. Refresh and try again.',409);return json({ok:true,id:next});
 }
 const p=permissions(m,t);let note='',removedFile:any=null;
 if(path==='delete-candidate-document'){
  requireHR(m);const candidate=(t.candidates||[]).find((c:any)=>c.id===body.candidateId);const doc=candidate?.documents?.find((d:any)=>d.id===body.documentId);if(!doc)fail('Candidate document not found.',404);removedFile=await stmt('SELECT * FROM files WHERE id=? AND ticket_id=? AND candidate_id=?',body.documentId,t.id,body.candidateId).first<any>();if(!removedFile)fail('Document not found.',404);candidate.documents=candidate.documents.filter((d:any)=>d.id!==body.documentId);note='Candidate document deleted';
 }else if(path==='candidate-review'){
  const c=(t.candidates||[]).find((c:any)=>c.id===body.candidateId);if(!c||(!isHR(m)&&t.requesterEmail!==m.email&&t.managerEmail!==m.email))fail('Only the requester, HOD or HR can decide on this candidate.',403);
  if((!recruitment.includes(t.status)&&t.status!=='Filled')||!['Applied','Shortlisted','Interview','On Hold'].includes(c.status))fail('Only active candidates in recruitment can be reviewed.');
  const reason=clean(body.reason,4000),decision=body.decision;if(!reason)fail('Enter your review note.');if(!['Interview requested','Rejected','On Hold','Offer requested','Resume'].includes(decision))fail('Choose a valid candidate decision.');
  const interviewed=c.interviewCompleted||(t.interviews||[]).some((i:any)=>i.candidateId===c.id&&!i.archived&&(i.completedAt||i.feedback));
  if(decision==='Offer requested'&&!interviewed&&!(body.interviewCompleted===true&&(c.interviewRequested||c.status==='Interview'||(c.status==='On Hold'&&c.holdPreviousStatus==='Interview'))))fail('Confirm that the interview took place before requesting an offer.');
  if(decision==='Interview requested'&&(c.interviewRequested||(t.interviews||[]).some((i:any)=>i.candidateId===c.id&&!i.archived)))fail('An interview is already requested or recorded.');
  if(decision==='Resume'&&c.status!=='On Hold')fail('Only a held candidate can be resumed.');
  const at=new Date().toISOString();c.review={decision,reason,by:m.name,email:m.email,at};c.reviewHistory??=[];c.reviewHistory.push(c.review);
  if(body.interviewCompleted===true){if(!interviewed&&!c.interviewRequested&&c.status!=='Interview'&&c.holdPreviousStatus!=='Interview')fail('An interview must be requested or recorded first.');c.interviewCompleted=true;c.interviewCompletedAt=at;}
  if(decision==='Rejected'){c.status='Rejected';c.interviewRequested=false;queueEmail(t,s,'rejection',c);note='Candidate rejected after review: '+c.name+' · '+reason;}
  else if(decision==='On Hold'){if(c.status!=='On Hold'){c.holdPreviousStatus=c.status;c.holdInterviewRequested=!!c.interviewRequested;}c.status='On Hold';c.interviewRequested=false;note='Candidate placed on hold: '+c.name+' · '+reason;}
  else if(decision==='Resume'){c.status=c.holdPreviousStatus||'Applied';c.interviewRequested=!!c.holdInterviewRequested;note='Candidate review resumed: '+c.name+' · '+reason;}
  else if(decision==='Offer requested'){c.status='Offer';c.offerRequested=true;c.interviewRequested=false;note='Offer preparation requested: '+c.name+' · '+reason;}
  else{c.status='Shortlisted';c.interviewRequested=true;note='Interview scheduling requested: '+c.name+' · '+reason;}
 }else if(path==='candidate'){
  requireHR(m);if(!t.approvals?.length||!t.approvals.every((a:any)=>a.done))fail('HR must approve the request before adding candidates.');t.candidates??=[];let c=body.candidateId?t.candidates.find((c:any)=>c.id===body.candidateId):null;if(body.candidateId&&!c)fail('Candidate not found.',404);const d=body.data||{};if(t.workflow==='Requester-led'&&((!c&&d.status!=='Applied')||(c&&d.status!==c.status)))fail('Use requester decisions and HR offer follow-up to change candidate status.');if(t.status==='Closed'&&(!body.candidateId||!['Hired','Rejected','Withdrawn'].includes(d.status)))fail('Reopen the position before adding active applications.');if(!clean(d.name,100)||!validEmail(d.email)||!['Applied','Shortlisted','Interview','On Hold','Offer','Hired','Rejected','Withdrawn'].includes(d.status)||!iso(d.appliedAt))fail('Enter candidate name, valid email, application date and status.');const email=clean(d.email,254).toLowerCase();if(t.candidates.some((x:any)=>x.id!==c?.id&&x.email===email))fail('This email already has an application for this position.');if(!c){c={id:crypto.randomUUID(),documents:[],createdAt:new Date().toISOString()};t.candidates.push(c);}Object.assign(c,{name:clean(d.name,100),email,phone:clean(d.phone,60),source:clean(d.source,100),appliedAt:d.appliedAt,status:d.status,notes:clean(d.notes,4000),updatedAt:new Date().toISOString()});if(['Hired','Rejected','Withdrawn'].includes(c.status))c.interviewRequested=false;note='Candidate record saved';
 }else if(path==='hr-financials'){
  requireHR(m);if(terminal.includes(t.status))fail('Only open positions can be edited.');applyHRFinance(t,body.financials);note='HR salary and budget details updated';
 }else if(path==='close-position'){
  requireHR(m);if(t.status==='Closed'||t.status==='Draft')fail('Only an open or completed hiring position can be closed.');closePosition(t,m,s,body);note='Position manually closed; remaining candidates rejected; email drafts on standby';
 }else if(path==='edit'){
  if(!p.edit)fail('Only the requester can edit drafts or clarification responses.',403);const d=payload(body.data);d.positionGroup=d.positionGroup||t.positionGroup;d.location=d.location||t.location;if(!positionTeams.includes(d.positionGroup))fail('Choose a valid position group / team.');if(!['COE','HQ'].includes(d.location))fail('Location must be HQ or COE.');if(d.location!==t.location)fail('Location is fixed after the position ID is allocated.');const editingOpen=isHR(m)&&!['Draft','Clarification Required'].includes(t.status);checkInput(d,editingOpen?false:!!body.draft);if(d.vacancies<(t.filledCount||0))fail('Vacancies cannot be lower than recorded hires.');Object.assign(t,d);
  if(!body.draft&&!editingOpen){if(t.type==='New headcount'&&!t.attachments.length)fail('Attach a job description for a new role.');t.status='Pending HR Review';t.submittedAt??=new Date().toISOString();t.owner='HR review queue';t.ownerEmail='';t.next=nextFor(t.status);t.due=t.due||'';t.approvals=[];}
  note=editingOpen?'Open position details updated':body.draft?'Draft saved':'Request submitted for HR review';
 }else if(path==='approve'){
  if((t.status==='Pending HR Review'||(t.status==='Pending Approval'&&body.startRecruitment===true))&&isHR(m)){if(t.status==='Pending HR Review'){applyHRFinance(t,body.financials);checkInput(t,false);if(body.budgetConfirmed!==true)fail('Confirm headcount and budget review.');}t.workflow='Requester-led';t.budgetConfirmedBy=m.name;t.authorisedAt=new Date().toISOString();t.authorisedBy=m.name;t.owner=m.name;t.ownerEmail=m.email;}else if(!p.approve)fail('Only HR can approve this request.',403);t.approvals=[{name:'HR',email:m.email,done:false}];const a=t.approvals[0];a.done=true;a.by=m.name;a.at=new Date().toISOString();note=a.name+' approval recorded';
  if(t.approvals.every((a:any)=>a.done)){t.status=t.authorisedAt?'Sourcing':'Approved';t.approvedAt=new Date().toISOString();t.next=nextFor(t.status);t.due=t.due||'';}else{t.next='Awaiting '+t.approvals.find((a:any)=>!a.done).name+' approval';t.due=t.due||'';}
 }else if(path==='assign'){
  requireHR(m);if(terminal.includes(t.status))fail('Closed outcomes cannot be reassigned.');const person=await activeMember(clean(body.ownerEmail));if(!person||!isHR(person))fail('Select an active HR owner.');if((body.due&&!iso(body.due))||!clean(body.next))fail('Enter a next action and, if provided, a valid due date.');t.owner=person!.name;t.ownerEmail=person!.email;t.next=clean(body.next);t.due=body.due||'';note='Assigned to '+t.owner+' · '+t.next+' · Due '+t.due;
 }else if(path==='comment'){
  if(!clean(body.text))fail('Enter a comment.');t.comments.push({text:clean(body.text,4000),actor:m.name,at:new Date().toISOString()});note='Comment added';
 }else if(path==='interview'){
  if(!p.recruit)fail('Only HR can schedule interviews during recruitment.',403);if((!clean(body.candidate)&&!body.candidateId)||!validEmail(body.interviewer)||!await activeMember(body.interviewer)||((!body.manual||body.at)&&!Number.isFinite(Date.parse(body.at))))fail('Enter candidate/reference, an active interviewer and a valid date if provided.');
  const candidate=body.candidateId?(t.candidates||[]).find((c:any)=>c.id===body.candidateId):null;if(body.candidateId&&!candidate)fail('Candidate not found.',404);if(t.workflow==='Requester-led'&&body.manual!==true)fail('Interviews are arranged manually; record the arrangement instead.');if(t.workflow==='Requester-led'&&(!candidate||!candidate.interviewRequested))fail('The requester must choose Interview before HR records a manual arrangement.');if(candidate){body.candidate=candidate.name;if(['Hired','Rejected','Withdrawn'].includes(candidate.status))fail('Select an active candidate.');candidate.status='Interview';candidate.interviewRequested=false;if(!body.manual)queueEmail(t,s,'interview',candidate,{interviewDate:body.at,interviewer:body.interviewer});}
  t.interviews??=[];t.interviews.push({id:crypto.randomUUID(),candidateId:candidate?.id||null,candidate:clean(body.candidate,100),interviewer:body.interviewer,at:body.at||null,manual:body.manual===true,feedback:'',recommendation:''});note=body.manual?'Manual interview arrangement recorded':'Interview scheduled';
 }else if(path==='feedback'){
  const i=t.interviews?.find((i:any)=>i.id===body.interviewId);if(i?.archived)fail('Previous-cycle feedback is retained as history and cannot be edited.');if(!i||(!isHR(m)&&t.requesterEmail!==m.email&&t.managerEmail!==m.email&&i.interviewer!==m.email))fail('Only HR or the assigned interviewer can record feedback.',403);if(!clean(body.text)||!['Proceed','Reject','Hold'].includes(body.recommendation))fail('Enter feedback and a recommendation.');i.feedback=clean(body.text,4000);i.recommendation=body.recommendation;i.feedbackBy=m.name;i.feedbackAt=new Date().toISOString();i.completedAt=i.feedbackAt;const c=(t.candidates||[]).find((c:any)=>c.id===i.candidateId);if(c){c.interviewCompleted=true;c.interviewCompletedAt=i.feedbackAt;}note='Interview feedback recorded';
 }else if(path==='candidate-offer'){
  requireHR(m);if(!p.recruit)fail('Only an open recruitment position can have offers.',403);const c=(t.candidates||[]).find((c:any)=>c.id===body.candidateId);if(!c)fail('Candidate not found.',404);if(!c.offerRequested||!['Offer','Hired'].includes(c.status))fail('The requester must select Offer after the interview first.');
  if(!Number.isFinite(+body.salary)||+body.salary<0||!iso(body.joiningDate)||!['Preparing','Sent','Accepted','Declined','Withdrawn'].includes(body.response))fail('Complete the offer details.');
  const milestone=body.hireMilestone||c.hireMilestone||'Offer accepted';if(!['Offer accepted','Employee joined'].includes(milestone))fail('Choose a valid hire milestone.');
  const counted=c.hireCounted===true||c.status==='Hired',at=new Date().toISOString();if(counted&&milestone!==(c.hireMilestone||'Offer accepted'))fail('The milestone cannot change after this hire has been recorded.');if(counted&&!['Accepted','Withdrawn'].includes(body.response))fail('Record withdrawal if an accepted candidate withdraws.');
  const joined=body.joined===true||body.joined==='on'||c.joined===true;
  if(counted&&body.response==='Withdrawn'){t.filledCount=Math.max(0,(t.filledCount||0)-1);c.hireCounted=false;if(!t.filledCount)delete t.filledAt;}
  const ready=body.response==='Accepted'&&(milestone==='Offer accepted'||joined);
  if(ready&&!counted){if((t.filledCount||0)>=t.vacancies)fail('All vacancies already have recorded hires.');t.filledCount=(t.filledCount||0)+1;c.hireCounted=true;c.status='Hired';c.hiredAt=at;if(t.filledCount>=t.vacancies){t.status='Filled';t.filledAt=at;}t.next=nextFor(t.status);}
  c.hireMilestone=milestone;c.joined=joined;if(joined)c.joinedAt??=at;
  if(['Declined','Withdrawn'].includes(body.response)){c.status=body.response==='Withdrawn'?'Withdrawn':'Rejected';c.offerRequested=false;}
  c.offerResponse=body.response;c.offerReference=clean(body.reference,500);c.offerHistory??=[];c.offerHistory.push({response:body.response,hireMilestone:milestone,joined,at,by:m.name});
  t.offer={candidateId:c.id,candidate:c.name,salary:+body.salary,joiningDate:body.joiningDate,response:body.response,reference:clean(body.reference,500),updatedAt:at};c.offer={...t.offer};t.offerHistory??=[];t.offerHistory.push({...t.offer});
  note='Offer '+body.response.toLowerCase()+' recorded manually for '+c.name;
 }else if(path==='offer'){
  if(t.workflow==='Requester-led')fail('Use the candidate offer follow-up after the requester selects Offer.');
  if(!p.recruit||!['Offer Preparation','Offer Pending'].includes(t.status))fail('Offers can be recorded by HR in the offer stages.',403);if(!clean(body.candidate)||!Number.isFinite(+body.salary)||+body.salary<0||!iso(body.joiningDate)||!['Preparing','Sent','Accepted','Declined'].includes(body.response))fail('Complete the offer details.');t.offer={candidate:clean(body.candidate,100),salary:+body.salary,joiningDate:body.joiningDate,response:body.response,updatedAt:new Date().toISOString()};note='Offer '+body.response.toLowerCase()+' for '+t.offer.candidate;
 }else if(path==='transition'){
  const target=body.status,reason=clean(body.reason,4000);if(['Rejected','Cancelled','Clarification Required','On Hold','Resume','Reopen'].includes(target)&&!reason)fail('A reason is required.');
  if(target==='Cancelled'){if(!p.cancel)fail('You cannot cancel this request.',403);}else if(target==='Rejected'){if(!p.approve)fail('Only the assigned approver can reject this request.',403);}else requireHR(m);
  let next=target;
  if(target==='Reopen'){if(!p.reopen)fail('Only final outcomes can be reopened.');next='Pending HR Review';t.approvals=[];delete t.outcome;delete t.closedAt;delete t.filledAt;delete t.approvedAt;delete t.authorisedAt;delete t.authorisedBy;t.filledCount=0;t.offer=null;t.interviews=(t.interviews||[]).map((i:any)=>({...i,archived:true}));}
  else if(target==='Resume'){if(t.status!=='On Hold')fail('Only held requests can be resumed.');next=t.previousStatus;}
  else if(target==='On Hold'){if(!p.hold||t.status==='On Hold'||!iso(body.review)||body.review<new Date().toISOString().slice(0,10))fail('Enter a current or future hold review date.');t.previousStatus=t.status;t.dueBeforeHold=t.due||'';t.holdReason=reason;}
  else if(target==='Candidate withdrawn'){
   if(!p.recruit||!['Offer Preparation','Offer Pending'].includes(t.status))fail('Candidate withdrawal is available during the offer stages.',403);
   if(!reason)fail('Record the withdrawal reason.');
   const candidate=(t.candidates||[]).find((c:any)=>c.id===body.candidateId);
   if(body.candidateId&&!candidate)fail('Candidate not found.',404);
   if(!candidate&&(t.candidates||[]).length)fail('Select the candidate who withdrew.');
   if(!candidate&&!clean(t.offer?.candidate))fail('Record an offer or candidate before recording withdrawal.');
   if(candidate&&['Hired','Rejected','Withdrawn'].includes(candidate.status))fail('Select an active candidate.');
   const at=new Date().toISOString();
   if(candidate){candidate.status='Withdrawn';candidate.withdrawalReason=reason;candidate.withdrawnAt=at;}
   t.offerHistory??=[];t.offerHistory.push({...t.offer,candidateId:candidate?.id||null,candidate:candidate?.name||t.offer?.candidate,response:'Withdrawn',reason,updatedAt:at});
   t.offer=null;next='Sourcing';
  }
  else if(target==='Sourcing'&&t.status==='Offer Pending'&&t.offer?.response==='Declined'){if(!reason)fail('Record why sourcing is restarting.');t.offer=null;}
  else if(!['Cancelled','Rejected'].includes(target)&&!allowedNext(t,next))fail('This transition is not allowed from the current stage.');
  if(next==='Pending Approval'){
   if(body.financials)applyHRFinance(t,body.financials);
   if(!clean(t.manager)||t.salaryMin==null||t.salaryMax==null||!Number.isFinite(+t.salaryMin)||!Number.isFinite(+t.salaryMax)||+t.salaryMin<0||+t.salaryMax<+t.salaryMin||!clean(t.costCentre)||!['Budgeted','Unbudgeted','TBD'].includes(t.budget))fail('HR must complete salary and budget details before routing for approval.');
   checkInput(t,false);if(t.type==='New headcount'&&!t.attachments.length)fail('A job description is required.');if(body.budgetConfirmed!==true)fail('Confirm headcount and budget review before routing.');t.budgetConfirmedBy=m.name;t.approvals=await approvalRoute(t,s);
  }
  if((recruitment.includes(next)||next==='Filled')&&(!t.approvals.length||!t.approvals.every((a:any)=>a.done)))fail('All required approvals must be complete.');
  if(next==='Ready for Recruitment'){const owner=await activeMember(t.ownerEmail);if(!owner||!isHR(owner))fail('Assign an HR owner before authorising recruitment.');t.authorisedBy=m.name;t.authorisedAt=new Date().toISOString();}
  if(recruitment.includes(next)&&next!=='Ready for Recruitment'&&!t.authorisedAt)fail('HR must authorise recruitment first.');
  if(next==='Offer Pending'&&target!=='Resume'&&(!t.offer||t.offer.response!=='Sent'))fail('Record a sent offer before awaiting a response.');
  if(next==='Offer Preparation'&&t.interviews?.some((i:any)=>!i.archived&&!i.feedback))fail('Record all scheduled interview feedback before preparing the offer.');
  if(next==='Filled'){if(t.offer?.response!=='Accepted')fail('Record an accepted offer first.');const count=+body.filledCount;if(!Number.isInteger(count)||count<1||count>t.vacancies)fail('Enter a valid number of filled vacancies.');if(s.closureRule==='Employee joined'&&body.joined!==true)fail('Confirm employee joining before marking Filled.');t.filledCount=(t.filledCount||0)+count;if(t.filledCount>t.vacancies)fail('Filled count exceeds requested vacancies.');if(t.filledCount<t.vacancies){next='Sourcing';t.offer=null;}else t.filledAt=new Date().toISOString();}
  if(next==='Closed'){closePosition(t,m,s,{outcome:t.filledCount?'Filled':t.status==='Cancelled'?'Cancelled':'Filled',reason:'Position closed manually',hiredCandidateIds:[]});}
  if(recruitment.includes(next)&&target!=='Resume'&&!reason)fail('Record a milestone note.');
  t.status=next;t.next=next==='On Hold'?'Review hold: '+reason:nextFor(next);t.due=next==='On Hold'?body.review:(target==='Resume'?t.dueBeforeHold||'':t.due||'');
  if(next==='Clarification Required'){t.owner=t.requester;t.ownerEmail=t.requesterEmail;}
  note='Status changed to '+next+(reason?': '+reason:'');
 }else fail('Unknown operation.',404);
 if(['candidate-review','candidate-offer'].includes(path)||(path==='interview'&&body.manual))syncCandidateStage(t);await record(t,m,note,version,undefined,removedFile?.id);if(removedFile)await env.BUCKET!.delete(removedFile.key);return json({ok:true,id:t.id});
 }catch(e:any){return json({error:e.message||'The operation could not be completed.'},e.status||400);}}

function queueEmail(t:Ticket,s:any,kind:string,c:any,extra:any={}){const template=kind==='rejection'?s.rejectTemplate:s.interviewTemplate;const values={candidate:c.name,position:t.title,ticketId:t.id,...extra};const render=(text:string)=>text.replace(/{{(candidate|position|ticketId|interviewDate|interviewer)}}/g,(_,key)=>String((values as any)[key]||''));t.emailQueue??=[];t.emailQueue.push({id:crypto.randomUUID(),candidateId:c.id,to:c.email,kind,subject:render(template.subject),body:render(template.body),status:'Standby — not sent',createdAt:new Date().toISOString()});}
function closePosition(t:Ticket,m:Member,s:any,input:any){if(!['Filled','Withdrawn','Cancelled'].includes(input.outcome))fail('Choose a closure outcome.');if(!clean(input.reason,2000))fail('Enter a closure reason.');const selected=input.hiredCandidateIds||[];if(Array.isArray(selected)&&selected.some((id:string)=>(t.candidates||[]).some((c:any)=>c.id===id&&c.hireMilestone==='Employee joined'&&!c.joined)))fail('Confirm employee joining in the candidate profile before closing as hired.');if(!Array.isArray(selected)||selected.some((id:string)=>!(t.candidates||[]).some((c:any)=>c.id===id)))fail('Choose valid hired candidates.');for(const c of t.candidates||[]){if(selected.includes(c.id)||(input.outcome==='Filled'&&(c.hireMilestone!=='Employee joined'||c.joined)&&t.offer?.response==='Accepted'&&(t.offer.candidateId===c.id||String(t.offer.candidate).toLowerCase()===String(c.name).toLowerCase())))c.status='Hired';else if(!['Hired','Rejected','Withdrawn'].includes(c.status)){c.status='Rejected';c.rejectionReason='Position closed';c.updatedAt=new Date().toISOString();queueEmail(t,s,'rejection',c);}}t.status='Closed';t.outcome=input.outcome;t.closedAt=new Date().toISOString();t.closedBy=m.name;t.filledCount=Math.max(t.filledCount||0,(t.candidates||[]).filter((c:any)=>c.status==='Hired').length);if(input.outcome==='Filled')t.filledAt??=t.closedAt;t.closureReason=clean(input.reason,2000);t.next='Position closed manually by HR';}

function applyHRFinance(t:Ticket,f:any){if(!f)fail('Enter HR salary and budget details.');if(f.salaryMin===''||f.salaryMax===''||f.salaryMin==null||f.salaryMax==null||!Number.isFinite(+f.salaryMin)||!Number.isFinite(+f.salaryMax)||+f.salaryMin<0||+f.salaryMax<+f.salaryMin||!['Budgeted','Unbudgeted','TBD'].includes(f.budget)||!clean(f.costCentre,200))fail('Enter a valid salary range (maximum must be at least minimum), funding status and cost centre.');Object.assign(t,{salaryMin:+f.salaryMin,salaryMax:+f.salaryMax,budget:f.budget,costCentre:clean(f.costCentre,200)});}

function syncCandidateStage(t:Ticket){if(terminal.includes(t.status)||t.status==='On Hold')return;const cs=t.candidates||[];if((t.filledCount||0)>=t.vacancies)t.status='Filled';else if(cs.some((c:any)=>c.status==='Offer'&&['Sent','Accepted'].includes(c.offerResponse)))t.status='Offer Pending';else if(cs.some((c:any)=>c.status==='Offer'))t.status='Offer Preparation';else if(cs.some((c:any)=>c.status==='Interview'||c.interviewRequested))t.status='Interview';else t.status='Sourcing';t.next=nextFor(t.status);}

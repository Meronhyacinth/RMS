import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../app/chatgpt-auth';
import {passwordLoginEnabled,hashPassword,verifyPassword,sessionCookie,logoutCookie,sessionUser,clearLegacyCookie} from './password-auth';
import {defaults,positionGroup,isHR,canViewCandidate,canView,permissions,safeTicket,validateInput,dueDate,nextFor,allowedNext,terminal,recruitment, type Ticket,type Member} from './rules';

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
 if(email===OWNER_EMAIL)await stmt('INSERT OR IGNORE INTO members (email,user_id,name,role,bu,active) VALUES (?,?,?,?,?,1)',email,u!.userId,u!.displayName,'admin','').run();
 const m=await stmt('SELECT * FROM members WHERE email=? AND active=1',email).first<Member>();
 if(passwordMode&&(u as any).authVersion!==undefined){const login=await stmt('SELECT version FROM staff_logins WHERE email=?',email).first<any>();if(!login||login.version!==(u as any).authVersion)fail('Your password changed. Please sign in again.',401);}
 if(!m)fail('Your account has not been added to RMS. Ask the workspace administrator for access.',403);
 if(!passwordMode&&m!.user_id&&m!.user_id!==u!.userId)fail('Account identity does not match membership.',403);
 if(!m!.user_id)await stmt('UPDATE members SET user_id=? WHERE email=? AND user_id IS NULL',u!.userId,email).run();
 return {...m!,user_id:u!.userId};
}
async function configuration(){const r=await stmt('SELECT data FROM config WHERE id=?','workflow').first<any>();return {...defaults,...(r?JSON.parse(r.data):{})};}
async function activeMember(email:string){return stmt('SELECT * FROM members WHERE email=? AND active=1',email).first<Member>();}
async function approvalRoute(t:Ticket,s:any){
 const rows=[{name:'Hiring Manager',email:t.managerEmail},...(t.type==='New headcount'?[{name:'Business Unit Head',email:s.buApprover}]:[]),...(t.budget!=='Budgeted'&&s.extraApproval?[{name:'Finance',email:s.financeApprover}]:[])];
 for(const a of rows)if(!a.email||!await activeMember(a.email))fail('Configure an active '+a.name+' approver before routing this request.');
 return rows.map(a=>({...a,done:false}));
}
function payload(data:Ticket){const keys=['positionGroup','title','bu','manager','managerEmail','team','grade','vacancies','employment','duration','location','justification','target','priority','urgency','requirements','salaryMin','salaryMax','budget','costCentre','replacement','vacancyDate','type'];const o:Ticket={};for(const k of keys)o[k]=typeof data[k]==='string'?clean(data[k],['requirements','justification'].includes(k)?6000:200):data[k];o.managerEmail=clean(o.managerEmail).toLowerCase();o.vacancies=+o.vacancies;o.salaryMin=+o.salaryMin;o.salaryMax=+o.salaryMax;return o;}
function checkInput(t:Ticket,draft:boolean){validateInput(t,draft);if(draft)return;if(!validEmail(t.managerEmail))fail('Enter a valid hiring manager email.');if(!iso(t.target))fail('Choose a valid joining date.');if(t.type==='Replacement'&&!iso(t.vacancyDate))fail('Choose a valid vacancy date.');if(!['Permanent','Contract','Temporary','Internship'].includes(t.employment))fail('Choose an employment type.');}
async function record(t:Ticket,m:Member,text:string,version?:number,file?:any){
 const at=new Date().toISOString(),mutation=crypto.randomUUID();t.updatedAt=at;t.history??=[];t.history.push({at,actor:m.name,text});
 const statements=version===undefined?[stmt('INSERT INTO tickets (id,data,version,mutation) VALUES (?,?,1,?)',t.id,JSON.stringify(t),mutation)]:[stmt('UPDATE tickets SET data=?,version=version+1,mutation=? WHERE id=? AND version=?',JSON.stringify(t),mutation,t.id,version)];
 statements.push(stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',crypto.randomUUID(),t.id,at,m.name,m.user_id,text,t.id,mutation));
 if(file)statements.push(stmt('INSERT INTO files (id,ticket_id,name,size,mime,key,by,candidate_id) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',file.id,t.id,file.name,file.size,file.mime,file.key,m.email,file.candidateId||null,t.id,mutation));
 const recipients=new Set([t.requesterEmail,t.ownerEmail,...(t.interviews||[]).map((i:any)=>i.interviewer),...(t.status==='Pending Approval'?[t.approvals.find((a:any)=>!a.done)?.email]:[])]);
 if(['Pending HR Review','Approved'].includes(t.status)){const hr=await stmt("SELECT email FROM members WHERE active=1 AND role IN ('hr','admin')").all<any>();for(const person of hr.results)recipients.add(person.email);}
 for(const email of recipients)if(email)statements.push(stmt('INSERT INTO notices (id,email,ticket_id,text,at,read) SELECT ?,?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM tickets WHERE id=? AND mutation=?)',crypto.randomUUID(),email,t.id,text,at,t.id,mutation));
 const r=await db().batch(statements);if(!r[0].meta.changes)fail('This request changed in another session. Refresh and try again.',409);
}
async function getTicket(id:string,m:Member){const r=await stmt('SELECT * FROM tickets WHERE id=? OR id=(SELECT new_id FROM ticket_id_aliases WHERE old_id=?)',id,id).first<any>();if(!r)fail('Request not found.',404);const t=JSON.parse(r.data);if(!canView(m,t))fail('You do not have access to this request.',403);return {t,version:r.version};}
const requireHR=(m:Member)=>{if(!isHR(m))fail('Only HR can perform this action.',403)};
const requireAdmin=(m:Member)=>{if(m.role!=='admin')fail('Only the administrator can perform this action.',403)};

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
  const people=await stmt(m.role==='admin'?'SELECT email,name,role,bu,active FROM members ORDER BY name':'SELECT email,name,role,bu,active FROM members WHERE active=1 ORDER BY name').all();
  const notices=await stmt('SELECT * FROM notices WHERE email=? ORDER BY at DESC LIMIT 150',m.email).all();
  return json({member:m,settings:s,tickets:ts,members:people.results.map((person:any)=>({...person,isOwner:person.email===OWNER_EMAIL})),notices:notices.results.filter((n:any)=>ts.some(t=>t.id===n.ticket_id))});
 }
 if(req.method==='GET'&&path.startsWith('files/')){
  const f=await stmt('SELECT * FROM files WHERE id=?',path.slice(6)).first<any>();if(!f)fail('Attachment not found.',404);const {t}=await getTicket(f.ticket_id,m);if(f.candidate_id&&!canViewCandidate(m,t,f.candidate_id))fail('This candidate document is not assigned to you.',403);
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
  try{const attachment={id:fid,name:clean(file.name,180),size:file.size,kind:clean(form.get('kind'),40)||'Resume'};if(candidate){if(!['Resume','Cover letter','Other'].includes(attachment.kind))fail('Choose a valid document type.');candidate.documents??=[];candidate.documents.push(attachment);}else t.attachments.push(attachment);await record(t,m,candidate?'Candidate document added':'Attachment added: '+clean(file.name,180),version,{id:fid,name:clean(file.name,180),size:file.size,mime:file.type,key,candidateId});}catch(e){await env.BUCKET!.delete(key);throw e}
  return json({ok:true});
 }
 const body=await req.json() as any;
 if(path==='staff-password'){
  requireAdmin(m);const email=clean(body.email).toLowerCase();if(email===OWNER_EMAIL)fail('The bootstrap admin password is managed in server settings.');if(!await activeMember(email))fail('Select an active staff member.');if(typeof body.password!=='string'||body.password.length<12||body.password.length>256)fail('Use a password of 12–256 characters.');const hash=await hashPassword(body.password);await stmt('INSERT INTO staff_logins (email,password_hash,version) VALUES (?,?,1) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,version=staff_logins.version+1',email,hash).run();await stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),'WORKSPACE',new Date().toISOString(),m.name,m.user_id,'Staff password reset: '+email).run();return json({ok:true});
 }
 if(path==='members'){
  requireAdmin(m);const email=clean(body.email).toLowerCase();if(!validEmail(email)||!['requester','approver','hr','admin','interviewer'].includes(body.role)||!clean(body.name))fail('Enter a name, email and valid role.');
  if(email===OWNER_EMAIL&&(body.role!=='admin'||body.active===false))fail('The Site owner must remain an active administrator.');
  await stmt('INSERT INTO members (email,name,role,bu,active) VALUES (?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,bu=excluded.bu,active=excluded.active',email,clean(body.name,100),body.role,clean(body.bu,100),body.active===false?0:1).run();
  await stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),'WORKSPACE',new Date().toISOString(),m.name,m.user_id,'Membership updated: '+email+' / '+body.role).run();return json({ok:true});
 }
 if(path==='settings'){
  requireAdmin(m);for(const k of ['hrSla','approvalSla','recruitmentSla'])if(!Number.isInteger(+body[k])||+body[k]<1||+body[k]>90)fail('SLA targets must be 1–90 business days.');
  const config={...s,...body};for(const k of ['systemEmail','replyTo']){config[k]=clean(config[k],254).toLowerCase();if(config[k]&&!validEmail(config[k]))fail('Enter a valid '+(k==='systemEmail'?'recruitment':'reply-to')+' email address.');}config.senderName=clean(config.senderName||'Recruitment team',100);for(const k of ['buApprover','financeApprover','escalationEmail']){config[k]=clean(config[k]).toLowerCase();if(config[k]&&!await activeMember(config[k]))fail('Select an active member for '+k+'.');}
  if(!Array.isArray(config.holidays)||config.holidays.length>100||config.holidays.some((x:string)=>!iso(x)))fail('Enter valid public holiday dates.');
  if(!['Offer accepted','Employee joined'].includes(config.closureRule))fail('Choose a valid Filled definition.');
  await stmt('INSERT INTO config (id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data','workflow',JSON.stringify(config)).run();
  await stmt('INSERT INTO events (id,ticket_id,at,actor,actor_id,text) VALUES (?,?,?,?,?,?)',crypto.randomUUID(),'WORKSPACE',new Date().toISOString(),m.name,m.user_id,'Workflow settings updated').run();return json({ok:true});
 }
 if(path==='read-notices'){await stmt('UPDATE notices SET read=1 WHERE email=?',m.email).run();return json({ok:true});}
 if(path==='create'){
  const t=payload(body.data);checkInput(t,true);if(t.positionGroup&&!['COE','HQ'].includes(t.positionGroup))fail('Choose COE or HQ.');const prefix=t.positionGroup||positionGroup(t.title,t.bu);const seq=await stmt('INSERT INTO ticket_counters (prefix,value) VALUES (?,1) ON CONFLICT(prefix) DO UPDATE SET value=ticket_counters.value+1 RETURNING value',prefix).first<any>();Object.assign(t,{id:prefix+'-'+String(seq.value).padStart(3,'0'),positionGroup:prefix,status:'Draft',requester:m.name,requesterEmail:m.email,owner:m.name,ownerEmail:m.email,created:new Date().toISOString().slice(0,10),next:nextFor('Draft'),due:dueDate(s.hrSla,s.holidays),attachments:[],approvals:[],comments:[],history:[],interviews:[],candidates:[],filledCount:0});
  await record(t,m,'Draft created');return json({id:t.id});
 }
 const {t,version}=await getTicket(body.id,m);if(body.version!==version)fail('This request changed in another session. Refresh and try again.',409);
 const p=permissions(m,t);let note='';
 if(path==='candidate'){
  requireHR(m);t.candidates??=[];let c=body.candidateId?t.candidates.find((c:any)=>c.id===body.candidateId):null;if(body.candidateId&&!c)fail('Candidate not found.',404);const d=body.data||{};if(!clean(d.name,100)||!validEmail(d.email)||!['Applied','Shortlisted','Interview','Offer','Hired','Rejected','Withdrawn'].includes(d.status)||!iso(d.appliedAt))fail('Enter candidate name, valid email, application date and status.');const email=clean(d.email,254).toLowerCase();if(t.candidates.some((x:any)=>x.id!==c?.id&&x.email===email))fail('This email already has an application for this position.');if(!c){c={id:crypto.randomUUID(),documents:[],createdAt:new Date().toISOString()};t.candidates.push(c);}Object.assign(c,{name:clean(d.name,100),email,phone:clean(d.phone,60),source:clean(d.source,100),appliedAt:d.appliedAt,status:d.status,notes:clean(d.notes,4000),updatedAt:new Date().toISOString()});note='Candidate record saved';
 }else if(path==='edit'){
  if(!p.edit)fail('Only the requester can edit drafts or clarification responses.',403);const d=payload(body.data);checkInput(d,!!body.draft);if(d.positionGroup&&d.positionGroup!==t.positionGroup)fail('The position group is fixed once its ID is allocated.');d.positionGroup=t.positionGroup;Object.assign(t,d);
  if(!body.draft){if(t.type==='New headcount'&&!t.attachments.length)fail('Attach a job description for a new role.');t.status='Pending HR Review';t.submittedAt??=new Date().toISOString();t.owner='HR review queue';t.ownerEmail='';t.next=nextFor(t.status);t.due=dueDate(s.hrSla,s.holidays);t.approvals=[];}
  note=body.draft?'Draft saved':'Request submitted for HR review';
 }else if(path==='approve'){
  if(!p.approve)fail('Only the current assigned approver can record this decision.',403);const a=t.approvals.find((a:any)=>!a.done);a.done=true;a.by=m.name;a.at=new Date().toISOString();note=a.name+' approval recorded';
  if(t.approvals.every((a:any)=>a.done)){t.status='Approved';t.approvedAt=new Date().toISOString();t.next=nextFor(t.status);t.due=dueDate(s.hrSla,s.holidays);}else{t.next='Awaiting '+t.approvals.find((a:any)=>!a.done).name+' approval';t.due=dueDate(s.approvalSla,s.holidays);}
 }else if(path==='assign'){
  requireHR(m);if(terminal.includes(t.status))fail('Closed outcomes cannot be reassigned.');const person=await activeMember(clean(body.ownerEmail));if(!person||!isHR(person))fail('Select an active HR owner.');if(!iso(body.due)||!clean(body.next))fail('Enter a next action and valid due date.');t.owner=person!.name;t.ownerEmail=person!.email;t.next=clean(body.next);t.due=body.due;note='Assigned to '+t.owner+' · '+t.next+' · Due '+t.due;
 }else if(path==='comment'){
  if(!clean(body.text))fail('Enter a comment.');t.comments.push({text:clean(body.text,4000),actor:m.name,at:new Date().toISOString()});note='Comment added';
 }else if(path==='interview'){
  if(!p.recruit)fail('Only HR can schedule interviews during recruitment.',403);if((!clean(body.candidate)&&!body.candidateId)||!validEmail(body.interviewer)||!await activeMember(body.interviewer)||!Number.isFinite(Date.parse(body.at)))fail('Enter candidate/reference, interview date and an active interviewer.');
  const candidate=body.candidateId?(t.candidates||[]).find((c:any)=>c.id===body.candidateId):null;if(body.candidateId&&!candidate)fail('Candidate not found.',404);if(candidate){body.candidate=candidate.name;candidate.status='Interview';}
  t.interviews??=[];t.interviews.push({id:crypto.randomUUID(),candidateId:candidate?.id||null,candidate:clean(body.candidate,100),interviewer:body.interviewer,at:body.at,feedback:'',recommendation:''});note='Interview scheduled';
 }else if(path==='feedback'){
  const i=t.interviews?.find((i:any)=>i.id===body.interviewId);if(i?.archived)fail('Previous-cycle feedback is retained as history and cannot be edited.');if(!i||(!isHR(m)&&i.interviewer!==m.email))fail('Only HR or the assigned interviewer can record feedback.',403);if(!clean(body.text)||!['Proceed','Reject','Hold'].includes(body.recommendation))fail('Enter feedback and a recommendation.');i.feedback=clean(body.text,4000);i.recommendation=body.recommendation;i.feedbackBy=m.name;i.feedbackAt=new Date().toISOString();note='Interview feedback recorded';
 }else if(path==='offer'){
  if(!p.recruit||!['Offer Preparation','Offer Pending'].includes(t.status))fail('Offers can be recorded by HR in the offer stages.',403);if(!clean(body.candidate)||!Number.isFinite(+body.salary)||+body.salary<0||!iso(body.joiningDate)||!['Preparing','Sent','Accepted','Declined'].includes(body.response))fail('Complete the offer details.');t.offer={candidate:clean(body.candidate,100),salary:+body.salary,joiningDate:body.joiningDate,response:body.response,updatedAt:new Date().toISOString()};note='Offer '+body.response.toLowerCase()+' for '+t.offer.candidate;
 }else if(path==='transition'){
  const target=body.status,reason=clean(body.reason,4000);if(['Rejected','Cancelled','Clarification Required','On Hold','Resume','Reopen'].includes(target)&&!reason)fail('A reason is required.');
  if(target==='Cancelled'){if(!p.cancel)fail('You cannot cancel this request.',403);}else if(target==='Rejected'){if(!p.approve)fail('Only the assigned approver can reject this request.',403);}else requireHR(m);
  let next=target;
  if(target==='Reopen'){if(!p.reopen)fail('Only final outcomes can be reopened.');next='Pending HR Review';t.approvals=[];delete t.outcome;delete t.closedAt;delete t.filledAt;delete t.approvedAt;delete t.authorisedAt;delete t.authorisedBy;t.filledCount=0;t.offer=null;t.interviews=(t.interviews||[]).map((i:any)=>({...i,archived:true}));}
  else if(target==='Resume'){if(t.status!=='On Hold')fail('Only held requests can be resumed.');next=t.previousStatus;}
  else if(target==='On Hold'){if(!p.hold||t.status==='On Hold'||!iso(body.review)||body.review<new Date().toISOString().slice(0,10))fail('Enter a current or future hold review date.');t.previousStatus=t.status;t.holdReason=reason;}
  else if(target==='Sourcing'&&t.status==='Offer Pending'&&t.offer?.response==='Declined'){if(!reason)fail('Record why sourcing is restarting.');t.offer=null;}
  else if(!['Cancelled','Rejected'].includes(target)&&!allowedNext(t,next))fail('This transition is not allowed from the current stage.');
  if(next==='Pending Approval'){
   checkInput(t,false);if(t.type==='New headcount'&&!t.attachments.length)fail('A job description is required.');if(body.budgetConfirmed!==true)fail('Confirm headcount and budget review before routing.');t.budgetConfirmedBy=m.name;t.approvals=await approvalRoute(t,s);
  }
  if((recruitment.includes(next)||next==='Filled')&&(!t.approvals.length||!t.approvals.every((a:any)=>a.done)))fail('All required approvals must be complete.');
  if(next==='Ready for Recruitment'){const owner=await activeMember(t.ownerEmail);if(!owner||!isHR(owner))fail('Assign an HR owner before authorising recruitment.');t.authorisedBy=m.name;t.authorisedAt=new Date().toISOString();}
  if(recruitment.includes(next)&&next!=='Ready for Recruitment'&&!t.authorisedAt)fail('HR must authorise recruitment first.');
  if(next==='Offer Pending'&&target!=='Resume'&&(!t.offer||t.offer.response!=='Sent'))fail('Record a sent offer before awaiting a response.');
  if(next==='Offer Preparation'&&t.interviews?.some((i:any)=>!i.archived&&!i.feedback))fail('Record all scheduled interview feedback before preparing the offer.');
  if(next==='Filled'){if(t.offer?.response!=='Accepted')fail('Record an accepted offer first.');const count=+body.filledCount;if(!Number.isInteger(count)||count<1||count>t.vacancies)fail('Enter a valid number of filled vacancies.');if(s.closureRule==='Employee joined'&&body.joined!==true)fail('Confirm employee joining before marking Filled.');t.filledCount=(t.filledCount||0)+count;if(t.filledCount>t.vacancies)fail('Filled count exceeds requested vacancies.');if(t.filledCount<t.vacancies){next='Sourcing';t.offer=null;}else t.filledAt=new Date().toISOString();}
  if(next==='Closed'){t.outcome=t.status;t.closedAt=new Date().toISOString();}
  if(recruitment.includes(next)&&target!=='Resume'&&!reason)fail('Record a milestone note.');
  t.status=next;t.next=next==='On Hold'?'Review hold: '+reason:nextFor(next);t.due=next==='On Hold'?body.review:dueDate(next==='Pending Approval'?s.approvalSla:recruitment.includes(next)?s.recruitmentSla:s.hrSla,s.holidays);
  if(next==='Clarification Required'){t.owner=t.requester;t.ownerEmail=t.requesterEmail;}
  note='Status changed to '+next+(reason?': '+reason:'');
 }else fail('Unknown operation.',404);
 await record(t,m,note,version);return json({ok:true,id:t.id});
 }catch(e:any){return json({error:e.message||'The operation could not be completed.'},e.status||400);}}

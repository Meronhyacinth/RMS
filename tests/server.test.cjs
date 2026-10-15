const {DatabaseSync}=require('node:sqlite');
const {readFileSync,readdirSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const assert=require('node:assert/strict');
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(join(__dirname,'../drizzle')).filter(n=>n.endsWith('.sql')))sqlite.exec(readFileSync(join(__dirname,'../drizzle',file),'utf8'));
const DB={prepare(sql){return {bind(...args){const q=sqlite.prepare(sql);return {async first(){return q.get(...args)||null},async all(){return {results:q.all(...args)}},async run(){const r=q.run(...args);return {meta:{changes:Number(r.changes)}}}}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
let identity={userId:'owner-id',email:'owner@example.test',displayName:'Workspace Owner'};
const objects=new Map();
const BUCKET={async put(k,v){objects.set(k,v)},async get(k){return objects.has(k)?{body:objects.get(k)}:null},async delete(k){objects.delete(k)}};
function load(name,requireFn){const source=ts.transpileModule(readFileSync(join(__dirname,'../lib',name),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const exports={};vm.runInNewContext(source,{exports,require:requireFn,Response,Request,Headers,URL,Date,Set,Number,String,JSON,Array,Error,TextEncoder,TextDecoder,btoa,atob,crypto:globalThis.crypto});return exports;}
const rules=load('rules.ts');
const testEnv={DB,BUCKET,RMS_OWNER_EMAIL:'owner@example.test'};
const passwordAuth=load('password-auth.ts',()=>({env:testEnv}));
const {handle}=load('server.ts',n=>n==='cloudflare:workers'?{env:testEnv}:n.includes('chatgpt-auth')?{getChatGPTUser:async()=>identity}:n.includes('password-auth')?passwordAuth:rules);
const BASE='https://rms.test/api/rms/';
async function call(path,data){const response=await handle(new Request(BASE+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json','Origin':'https://rms.test'},body:data===undefined?undefined:JSON.stringify(data)}));return {status:response.status,data:await response.json()};}
async function ok(path,data){const r=await call(path,data);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
async function ticket(id){return (await ok('workspace')).tickets.find(t=>t.id===id);}
async function change(path,id,data={}){const t=await ticket(id);return ok(path,{id,version:t.version,...data});}
const data={title:'Service Engineer',bu:'Technology',manager:'Manager',managerEmail:'manager@example.com',team:'Services',grade:'Engineer',vacancies:1,employment:'Permanent',location:'Kuala Lumpur',justification:'Replace departing engineer',target:'2026-12-01',priority:'Normal',requirements:'Service experience',salaryMin:4000,salaryMax:6000,budget:'Budgeted',costCentre:'CC-01',replacement:'EMP-01',vacancyDate:'2026-10-14',type:'Replacement'};
(async()=>{
 identity=null;assert.equal((await call('workspace')).status,401);
 identity={userId:'uninvited',email:'outsider@example.com',displayName:'Outsider'};assert.equal((await call('workspace')).status,403);
 identity={userId:'owner-id',email:'owner@example.test',displayName:'Workspace Owner'};
 await ok('workspace');
 for(const [email,name,role] of [['requester@example.com','Requester','requester'],['manager@example.com','Manager','approver'],['bu@example.com','BU head','approver'],['finance@example.com','Finance','approver'],['hr@example.com','Recruiter','hr'],['interviewer@example.com','Interviewer','requester']])await ok('members',{email,name,role});
 await ok('settings',{hrSla:2,approvalSla:3,recruitmentSla:5,extraApproval:true,buApprover:'bu@example.com',financeApprover:'finance@example.com',escalationEmail:'hr@example.com',holidays:['2026-10-16'],closureRule:'Offer accepted'});
 const act=email=>identity={userId:email,email,displayName:email};
 act('requester@example.com');const {id}=await ok('create',{data});await change('edit',id,{data,draft:false});
 let t=await ticket(id);assert.equal(t.status,'Pending HR Review');
 assert.equal((await call('transition',{id,version:t.version,status:'Sourcing'})).status,403);
 assert.equal((await call('members',{email:'test@example.com',name:'Test',role:'admin'})).status,403);
 act('interviewer@example.com');assert.equal((await ok('workspace')).tickets.length,0);assert.equal((await call('comment',{id,version:t.version,text:'Intrusion'})).status,403);
 act('hr@example.com');assert.equal((await call('transition',{id,version:t.version,status:'Pending Approval'})).status,400);
 await change('transition',id,{status:'Clarification Required',reason:'Confirm service requirements'});
 act('requester@example.com');await change('edit',id,{data,draft:false});assert.equal((await ticket(id)).id,id);
 act('hr@example.com');await change('transition',id,{status:'Pending Approval',budgetConfirmed:true});t=await ticket(id);assert.equal(t.approvals.length,1);
 assert.equal((await call('approve',{id,version:t.version})).status,403);
 act('manager@example.com');await change('approve',id);assert.equal((await ticket(id)).status,'Approved');
 act('hr@example.com');t=await ticket(id);assert.equal((await call('transition',{id,version:t.version,status:'Ready for Recruitment'})).status,400);
 await change('assign',id,{ownerEmail:'hr@example.com',due:'2026-10-20',next:'Launch sourcing'});
 await change('transition',id,{status:'Ready for Recruitment',reason:'Authorised'});
 const stale=await ticket(id);await change('comment',id,{text:'Ready'});const before=sqlite.prepare('SELECT COUNT(*) AS n FROM events').get().n;
 assert.equal((await call('comment',{id,version:stale.version,text:'Stale write'})).status,409);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM events').get().n,before);
 for(const status of ['Sourcing','Screening','Interview'])await change('transition',id,{status,reason:'Milestone recorded'});
 await change('interview',id,{candidate:'CAND-01',interviewer:'interviewer@example.com',at:'2026-10-20T10:00:00+08:00'});
 // Candidate documents are scoped to the assigned candidate, not merely the position.
 await change('candidate',id,{data:{name:'Candidate Alpha',email:'alpha@example.test',phone:'0123',source:'JobStreet',appliedAt:'2026-10-15',status:'Shortlisted',notes:'HR only assessment'}});
 await change('candidate',id,{data:{name:'Candidate Beta',email:'beta@example.test',source:'Email',appliedAt:'2026-10-15',status:'Applied',notes:'Confidential'}});
 let candidateTicket=await ticket(id),alpha=candidateTicket.candidates[0],beta=candidateTicket.candidates[1];
 assert.equal((await call('candidate',{id,version:candidateTicket.version,data:{...alpha,name:'Duplicate',status:'Applied'}})).status,400);
 async function candidateUpload(candidateId,name,contents){const form=new FormData();form.set('ticketId',id);form.set('candidateId',candidateId);form.set('kind','Resume');form.set('file',new File([contents],name,{type:'application/pdf'}));return handle(new Request(BASE+'upload',{method:'POST',headers:{Origin:'https://rms.test'},body:form}));}
 assert.equal((await candidateUpload(alpha.id,'alpha.pdf','Alpha private resume')).status,200);
 assert.equal((await candidateUpload(beta.id,'beta.pdf','Beta private resume')).status,200);
 candidateTicket=await ticket(id);const alphaFile=candidateTicket.candidates[0].documents[0].id,betaFile=candidateTicket.candidates[1].documents[0].id;
 await change('interview',id,{candidateId:alpha.id,interviewer:'interviewer@example.com',at:'2026-10-20T11:00:00+08:00'});
 act('requester@example.com');assert.equal((await ticket(id)).candidates.length,0);assert.equal((await handle(new Request(BASE+'files/'+alphaFile))).status,403);
 act('interviewer@example.com');candidateTicket=await ticket(id);assert.equal(candidateTicket.candidates.length,1);assert.equal(candidateTicket.candidates[0].id,alpha.id);assert.equal(candidateTicket.candidates[0].notes,undefined);
 assert.equal((await candidateUpload(alpha.id,'intrusion.pdf','Unwanted')).status,403);
 assert.equal((await call('candidate',{id,version:candidateTicket.version,candidateId:alpha.id,data:{...alpha,name:'Tampered'}})).status,403);
 const preview=await handle(new Request(BASE+'files/'+alphaFile+'?view=1'));assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'application/pdf');assert.equal(await preview.text(),'Alpha private resume');
 assert.equal((await handle(new Request(BASE+'files/'+betaFile))).status,403);
 const assignedInterview=candidateTicket.interviews.find(i=>i.candidateId===alpha.id);await change('feedback',id,{interviewId:assignedInterview.id,text:'Suitable skills',recommendation:'Proceed'});
 act('manager@example.com');assert.equal((await ticket(id)).candidates.length,0);assert.equal((await handle(new Request(BASE+'files/'+alphaFile))).status,403);
 act('hr@example.com');
 console.log('PASS: candidate creation, duplicate applications, private resume upload, PDF preview, candidate-level interviewer isolation and HR-only profile updates');
 await change('transition',id,{status:'Feedback Pending',reason:'Interview complete'});t=await ticket(id);
 assert.equal((await call('transition',{id,version:t.version,status:'Offer Preparation',reason:'Try skipping feedback'})).status,400);
 act('interviewer@example.com');t=await ticket(id);assert.equal(t.salaryMin,undefined);assert.equal(t.replacement,undefined);assert.equal(t.interviews.length,2);
 await change('feedback',id,{interviewId:t.interviews[0].id,text:'Technical requirements met',recommendation:'Proceed'});
 act('hr@example.com');await change('transition',id,{status:'Offer Preparation',reason:'Feedback complete'});
 await change('offer',id,{candidate:'CAND-01',salary:5500,joiningDate:'2026-12-01',response:'Sent'});
 await change('transition',id,{status:'Offer Pending',reason:'Offer sent'});t=await ticket(id);
 assert.equal((await call('transition',{id,version:t.version,status:'Filled',reason:'Premature',filledCount:1})).status,400);
 await change('offer',id,{candidate:'CAND-01',salary:5500,joiningDate:'2026-12-01',response:'Accepted'});
 await change('transition',id,{status:'On Hold',reason:'Joining confirmation',review:'2026-12-01'});
 await change('transition',id,{status:'Resume',reason:'Confirmed'});assert.equal((await ticket(id)).status,'Offer Pending');
 await change('transition',id,{status:'Filled',reason:'Offer accepted',filledCount:1});await change('transition',id,{status:'Closed'});assert.equal((await ticket(id)).outcome,'Filled');
 await change('transition',id,{status:'Reopen',reason:'New vacancy required'});t=await ticket(id);assert.equal(t.id,id);assert.equal(t.status,'Pending HR Review');assert.equal(t.approvals.length,0);assert.equal(t.filledAt,undefined);assert.equal(t.offer,null);assert.equal(t.candidates.length,2);assert.ok(t.interviews.every(i=>i.archived),'Reopening preserves prior interviews');
 act('requester@example.com');const newRole={...data,type:'New headcount',budget:'Unbudgeted'};const n=await ok('create',{data:newRole});t=await ticket(n.id);assert.equal((await call('edit',{id:n.id,version:t.version,data:newRole,draft:false})).status,400);
 const upload=new FormData();upload.set('ticketId',n.id);upload.set('file',new File(['Sample JD'],'JD.txt',{type:'text/plain'}));const uploaded=await handle(new Request(BASE+'upload',{method:'POST',headers:{Origin:'https://rms.test'},body:upload}));assert.equal(uploaded.status,200);await change('edit',n.id,{data:newRole,draft:false});
 act('hr@example.com');await change('transition',n.id,{status:'Pending Approval',budgetConfirmed:true});assert.equal((await ticket(n.id)).approvals.length,3);
 act('finance@example.com');t=await ticket(n.id);assert.equal((await call('approve',{id:n.id,version:t.version})).status,403);
 for(const email of ['manager@example.com','bu@example.com','finance@example.com']){act(email);await change('approve',n.id);}
 assert.equal((await ticket(n.id)).status,'Approved');
 assert.equal(rules.dueDate(1,['2026-10-16'],new Date('2026-10-15T12:00:00Z')),'2026-10-19');
 act('interviewer@example.com');const denied=await handle(new Request(BASE+'files/'+(await (async()=>{act('hr@example.com');const tt=await ticket(n.id);act('interviewer@example.com');return tt.attachments[0].id;})())));assert.equal(denied.status,403);
 console.log('PASS: server authentication, membership, roles, confidentiality, conditional approval routing, approval order, HR authorisation, screening, interviews, feedback gate, offers, fill/close/reopen, holds, private uploads/downloads, concurrency, audit integrity and holiday SLAs');
 const {pbkdf2Sync,randomBytes}=require('node:crypto');
 const salt=randomBytes(16),testPassword='FixturePassword-123';
 testEnv.RMS_ADMIN_PASSWORD_HASH='pbkdf2-sha256$100000$'+salt.toString('base64url')+'$'+pbkdf2Sync(testPassword,salt,100000,32,'sha256').toString('base64url');testEnv.RMS_SESSION_SECRET=randomBytes(48).toString('base64url');
 assert.equal(await passwordAuth.verifyPassword('incorrect'),false);assert.equal(await passwordAuth.verifyPassword(testPassword),true);
 identity={userId:'owner-id',email:'owner@example.test',displayName:'Owner'};
 assert.equal((await call('workspace')).status,401,'ChatGPT identity cannot bypass configured password login');
 assert.equal((await call('login',{username:'admin',password:'incorrect'})).status,401);
 const login=await handle(new Request(BASE+'login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://rms.test'},body:JSON.stringify({username:'admin',password:testPassword})}));assert.equal(login.status,200);
 const cookie=login.headers.getSetCookie().find(c=>!c.includes('Max-Age=0'));assert.ok(cookie);assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));assert.ok(cookie.includes('SameSite=None'));assert.ok(cookie.includes('Partitioned'));
 const cookieHeader=cookie.split(';')[0];
 assert.equal((await handle(new Request(BASE+'workspace',{headers:{cookie:cookieHeader}}))).status,200);
 assert.equal((await handle(new Request(BASE+'workspace',{headers:{cookie:cookieHeader+'tampered'}}))).status,401);
 const workspaceResponse=await handle(new Request(BASE+'workspace',{headers:{cookie:cookieHeader}}));const workspace=await workspaceResponse.json();
 const emailSettings={...workspace.settings,systemEmail:'recruitment@example.com',replyTo:'hr@example.com',senderName:'HR Team'};
 const saveEmail=await handle(new Request(BASE+'settings',{method:'POST',headers:{cookie:cookieHeader,Origin:'https://rms.test','Content-Type':'application/json'},body:JSON.stringify(emailSettings)}));assert.equal(saveEmail.status,200);
 const updatedResponse=await handle(new Request(BASE+'workspace',{headers:{cookie:cookieHeader}}));const updated=await updatedResponse.json();assert.equal(updated.settings.systemEmail,'recruitment@example.com');assert.equal(updated.settings.replyTo,'hr@example.com');
 const badEmail=await handle(new Request(BASE+'settings',{method:'POST',headers:{cookie:cookieHeader,Origin:'https://rms.test','Content-Type':'application/json'},body:JSON.stringify({...emailSettings,systemEmail:'bad-email'})}));assert.equal(badEmail.status,400);
 console.log('PASS: administrator email settings persist and invalid addresses are rejected');
 const staffEmail='lead@example.test',staffPassword='Lead-Fixture-Password-123';
 async function authenticated(path,body,cookie=cookieHeader){return handle(new Request(BASE+path,{method:body===undefined?'GET':'POST',headers:{cookie,Origin:'https://rms.test','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));}
 assert.equal((await authenticated('members',{email:staffEmail,name:'Team Lead',role:'interviewer',active:true})).status,200);
 assert.equal((await authenticated('staff-password',{email:staffEmail,password:'short'})).status,400);
 assert.equal((await authenticated('staff-password',{email:staffEmail,password:staffPassword})).status,200);
 async function staffSignIn(password){return handle(new Request(BASE+'login',{method:'POST',headers:{Origin:'https://rms.test','Content-Type':'application/json'},body:JSON.stringify({username:staffEmail,password})}));}
 const staffLogin=await staffSignIn(staffPassword);assert.equal(staffLogin.status,200);const staffCookie=staffLogin.headers.getSetCookie().find(c=>!c.includes('Max-Age=0')).split(';')[0];
 const staffWorkspace=await authenticated('workspace',undefined,staffCookie);assert.equal(staffWorkspace.status,200);const staffData=await staffWorkspace.json();assert.equal(staffData.member.role,'interviewer');assert.equal(staffData.tickets.length,0);
 assert.equal((await authenticated('staff-password',{email:'hr@example.com',password:staffPassword},staffCookie)).status,403);
 assert.equal((await authenticated('staff-password',{email:staffEmail,password:staffPassword+'2'})).status,200);
 assert.equal((await authenticated('workspace',undefined,staffCookie)).status,401,'Reset invalidates old staff sessions');
 assert.equal((await staffSignIn(staffPassword)).status,401);const relogin=await staffSignIn(staffPassword+'2');assert.equal(relogin.status,200);const newCookie=relogin.headers.getSetCookie().find(c=>!c.includes('Max-Age=0')).split(';')[0];
 await authenticated('members',{email:staffEmail,name:'Team Lead',role:'interviewer',active:false});assert.equal((await authenticated('workspace',undefined,newCookie)).status,403);assert.equal((await staffSignIn(staffPassword+'2')).status,401);
 console.log('PASS: individual staff login, hashed password reset, reset-session revocation, admin-only credentials and disabled-account denial');
 
 const logout=await handle(new Request(BASE+'logout',{method:'POST',headers:{Origin:'https://rms.test',cookie:cookieHeader},body:'{}'}));assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
 for(let i=0;i<10;i++){const r=await handle(new Request(BASE+'login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://rms.test','cf-connecting-ip':'10.0.0.3'},body:JSON.stringify({username:'admin',password:'incorrect'})}));assert.equal(r.status,401);}
 const locked=await handle(new Request(BASE+'login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://rms.test','cf-connecting-ip':'10.0.0.3'},body:JSON.stringify({username:'admin',password:testPassword})}));assert.equal(locked.status,429);
 const crossOrigin=await handle(new Request(BASE+'login',{method:'POST',headers:{Origin:'https://other.test'},body:'{}'}));assert.equal(crossOrigin.status,403);
 console.log('PASS: password hashing, admin login, cookie protection, tampering rejection, ChatGPT bypass prevention, sign-out, rate limiting and cross-origin protection');
 sqlite.close();
})().catch(e=>{console.error(e);process.exitCode=1;sqlite.close()});

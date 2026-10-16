const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const fake = () => ({innerHTML:'',textContent:'',value:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true},close(){this.open=false}});
const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,fake());return elements.get(selector)}};
const store=new Map();
const context=vm.createContext({document,console,Date,JSON,String,Number,Math,Set,Blob,URL,FormData,assert,location:{hash:'',search:'?demo=1'},URLSearchParams,window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout(){}});
vm.runInContext(fs.readFileSync(__dirname+'/../public/icons.js','utf8'),context);

const routeStore=new Map(),routeEvents={},routeCalls=[];let systemThemeChange;const systemPreference={matches:false,addEventListener:(name,handler)=>systemThemeChange=handler};context.window.matchMedia=()=>systemPreference;
context.sessionStorage={getItem:k=>routeStore.get(k)||null,setItem:(k,v)=>routeStore.set(k,v)};
context.window.history={state:null,pushState(state,unused,url){this.state=state;routeCalls.push({state,url});context.location.hash='';context.location.search='';},replaceState(state,unused,url){this.state=state;routeCalls.push({state,url});context.location.hash='';context.location.search='';}};
context.window.addEventListener=(name,handler)=>routeEvents[name]=handler;
vm.runInContext(fs.readFileSync(__dirname+'/../public/app.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/../public/workspace.js','utf8'),context);

for(const section of ['dashboard','requests','approvals','pipeline','candidates','archive','reports','audit','settings','workflow','notifications']){
 vm.runInContext('navigate('+JSON.stringify(section)+')',context);
 assert.equal(routeCalls.at(-1).url,'/');assert.equal(routeStore.get('rms-page'),section);
}
assert.equal(routeStore.get('rms-demo'),'1');
routeEvents.popstate({state:{rmsPage:'candidates'}});
assert.equal(vm.runInContext('page',context),'candidates');assert.equal(routeCalls.at(-1).url,'/');
const reloaded=vm.createContext({URLSearchParams,location:{search:'',hash:''},window:{history:context.window.history},sessionStorage:context.sessionStorage});
const routingSource=fs.readFileSync(__dirname+'/../public/app.js','utf8').split('const $=')[0];
vm.runInContext(routingSource,reloaded);
assert.equal(vm.runInContext('rmsDemoMode',reloaded),true);assert.equal(vm.runInContext('rmsInitialPage',reloaded),'candidates');
vm.runInContext("navigate('dashboard')",context);
console.log('PASS: every section uses root URL; back navigation and reload preserve section and demo mode');
vm.runInContext(`
const blocked=tickets.find(t=>t.status==='Pending Approval');
transition(blocked.id,'Sourcing');
assert.equal(blocked.status,'Pending Approval','Unapproved request must not enter sourcing');
assert.equal(blocked.approvals.length,1);approve(blocked.id,0);
assert.equal(blocked.status,'Approved');
transition(blocked.id,'Ready for Recruitment');
assert.equal(blocked.status,'Ready for Recruitment');
transition(blocked.id,'Sourcing');
assert.equal(blocked.status,'Sourcing');
assert.ok(blocked.history.some(e=>e.text.includes('All approvals complete')));
assert.deepEqual(Array.from(route({type:'Replacement',budget:'Budgeted'})),['HR']);
assert.deepEqual(Array.from(route({type:'New headcount',budget:'Unbudgeted'})),['HR']);
assert.equal(esc('<script>'), '&lt;script&gt;');
assert.equal(csvCell('=CMD()').charCodeAt(1),39);
transition(blocked.id,'On Hold','Awaiting budget review');
assert.equal(blocked.previousStatus,'Sourcing');
const original=blocked.id;
transition(blocked.id,'Cancelled','Business need withdrawn');
transition(blocked.id,'Closed');
assert.equal(blocked.outcome,'Cancelled');
assert.equal(blocked.id,original);
for(const p of ['dashboard','requests','approvals','pipeline','archive','audit','reports','settings','workflow','notifications']){page=p;render();assert.ok(document.querySelector('#main').innerHTML.length>100,p+' renders');}
console.log('PASS: approval gates, ordered approvals, conditional routing, history, hold, closure, escaping, CSV safety and all 10 screens');
`,context);
// Verify the shared UI sends the authorisation note required by the server.
const liveContext=vm.createContext({document:{querySelector(){return {...fake(),insertAdjacentHTML(){}}}},console,Date,JSON,String,Number,Math,Set,Blob,URL,FormData,URLSearchParams,assert,location:{hash:'',search:''},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem(){return null},setItem(){}},setTimeout(){},fetch:()=>new Promise(()=>{})});
vm.runInContext(fs.readFileSync(__dirname+'/../public/icons.js','utf8'),liveContext);
vm.runInContext(fs.readFileSync(__dirname+'/../public/app.js','utf8'),liveContext);
vm.runInContext(fs.readFileSync(__dirname+'/../public/workspace.js','utf8'),liveContext);
vm.runInContext(`let sent; action=(path,data,id)=>{sent={path,data,id};}; transition('RMS-test','Ready for Recruitment'); assert.equal(sent.path,'transition'); assert.equal(sent.data.status,'Ready for Recruitment'); assert.ok(sent.data.reason.length>0); console.log('PASS: shared UI authorisation sends the required milestone note');`,liveContext);

vm.runInContext(`assert.equal(tickets.length,0,'Unauthenticated shared UI must not load sample records'); let prompted=false; showLogin=()=>{prompted=true}; page='requests'; render(); assert.equal(prompted,true,'Navigation must not bypass sign-in'); console.log('PASS: unauthenticated navigation cannot open the shared workspace');`,liveContext);

vm.runInContext(fs.readFileSync(__dirname+'/../public/candidates.js','utf8'),context);
vm.runInContext(`
page='candidates';render();assert.ok(document.querySelector('#main').innerHTML.includes('Jamie Tan'));
const sample=tickets.find(t=>t.candidates?.length);candidateDetail(sample.id,sample.candidates[0].id);assert.ok(document.querySelector('#dialog').innerHTML.includes('Résumé & application documents'));
candidateForm(sample.id);assert.ok(document.querySelector('#dialog').innerHTML.includes('Save candidate'));
interviewDialog(sample.id,sample.candidates[0].id);assert.ok(document.querySelector('#dialog').innerHTML.includes('candidateId'));
console.log('PASS: candidate directory, profile, private-document controls and candidate-linked interview form render');
`,context);

context.crypto={getRandomValues:require('node:crypto').webcrypto.getRandomValues.bind(require('node:crypto').webcrypto)};
context.Uint8Array=Uint8Array;
context.FileReader=class{readAsDataURL(){this.result='data:application/pdf;base64,JVBERi0x';this.onload();}};
(async()=>{await vm.runInContext(`(async()=>{
assert.equal(typeof crypto.randomUUID,'undefined');
const ids=new Set(Array.from({length:50},()=>demoRecordId()));assert.equal(ids.size,50);assert.ok([...ids].every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
const t=tickets.find(t=>t.candidates?.length),c=t.candidates[0],before=c.documents.length;
await uploadCandidateDocument({preventDefault(){},target:{file:{files:[{name:'sample.pdf',size:100}]},kind:{value:'Resume'}}},t.id,c.id);
assert.equal(c.documents.length,before+1);assert.ok(c.documents.at(-1).url.startsWith('data:application/pdf'));assert.equal(busy,false);
window.confirm=()=>true;await deleteCandidateDocument(t.id,c.id,c.documents.at(-1).id);assert.equal(c.documents.length,before);console.log('PASS: demo résumé upload and document deletion work without crypto.randomUUID on HTTP LAN browsers');
})()`,context);})().catch(e=>{console.error(e);process.exitCode=1;});

const appSource=fs.readFileSync(__dirname+'/../public/app.js','utf8');
const newRequestSource=appSource.slice(appSource.indexOf('function newRequest('),appSource.indexOf('function conditional('));
assert.ok(!newRequestSource.includes("'salaryMin'"));assert.ok(!newRequestSource.includes("'salaryMax'"));assert.ok(!newRequestSource.includes("'costCentre'"));
vm.runInContext(`const financeHTML=hrFinanceFields({});assert.ok(financeHTML.includes('name="salaryMin"'));assert.ok(financeHTML.includes('name="costCentre"'));console.log('PASS: request omits HR-only budget fields; HR review includes them');`,context);

vm.runInContext(fs.readFileSync(__dirname+'/../public/hr-policies.js','utf8'),context);
vm.runInContext(`
const lo={value:'6000'},hi={value:'4000'};syncSalaryBounds({elements:{namedItem:n=>n==='salaryMin'?lo:hi}});assert.equal(hi.value,'6000');assert.equal(hi.min,'6000');
assert.ok(!hrFinanceFields({}).includes('name="manager"'));
assert.ok(settingsPage().includes('Rejection email template'));assert.ok(settingsPage().includes('Interview email template'));assert.ok(settingsPage().includes('Edit ticket ID'));assert.ok(settingsPage().includes('Position catalogue'));
const hrT=tickets.find(t=>t.candidates?.length);closePositionDialog(hrT.id);assert.ok(document.querySelector('#dialog').innerHTML.includes('No email is sent'));
assert.ok(dashboard().includes('Withdrawn'));assert.equal(terminal.includes('Filled'),false);
console.log('PASS: salary bound alignment, requestor HOD ownership, HR settings/templates, manual-closure dialog and withdrawal bar');
`,context);

vm.runInContext(`const offerTicket=tickets.find(t=>t.status==='Offer Pending');advanceDialog(offerTicket.id);assert.ok(document.querySelector('#dialog').innerHTML.includes('Candidate withdrawn'));assert.ok(document.querySelector('#dialog').innerHTML.includes('Hold review date'));assert.ok(document.querySelector('#dialog').innerHTML.includes('On Hold'));`,context);
console.log('PASS: demo offer update includes candidate withdrawal and hold review controls');

assert.ok(newRequestSource.includes("'manager'"));assert.ok(newRequestSource.includes('HOD name *'));
vm.runInContext(`const reviewT=tickets.find(t=>t.candidates?.length),reviewC=reviewT.candidates[0];candidateReviewDialog(reviewT.id,reviewC.id,'Interview requested');assert.ok(document.querySelector('#dialog').innerHTML.includes('Notify HR to arrange interview'));assert.ok(candidateReviewActions({...reviewT,status:'Interview'},{...reviewC,status:'Applied'}).includes('Reject'));assert.ok(candidateReviewActions(reviewT,{...reviewC,status:'Hired'}).includes('Close hiring position'));assert.ok(dashboard().includes('metric-alert-stack'));assert.ok(dashboard().includes('showHighPriority()'));showHighPriority();assert.ok(document.querySelector('#dialog').innerHTML.includes('High-priority hiring'));assert.ok(priorityBadge({priority:'High'}).includes('priority-alert'));`,context);
console.log('PASS: requestor HOD fields, team-lead interview request, reject action, hired closure button and prominent priority alerts');

vm.runInContext(`assert.ok(!settingsPage().includes('HR review days'));assert.ok(!settingsPage().includes('Public holidays'));assert.equal(overdue({status:'Sourcing',due:''}),false);assert.equal(date(''),'Not set');`,context);
console.log('PASS: SLA fields removed; unset due dates remain optional and are not overdue');

vm.runInContext(`liveMember={role:'hr'};members=[{email:'lead@example.test',name:'Lead',role:'team_lead',active:1},{email:'boss@example.test',name:'Boss',role:'boss',active:1,isOwner:true}];assert.ok(teamPage().includes('Delete user'));assert.ok(!teamPage().includes('<option value="boss">'));assert.equal(canManageMember(members[0]),true);assert.equal(canManageMember(members[1]),false);liveMember={role:'boss'};assert.ok(teamPage().includes('<option value="boss">Boss</option>'));liveMember={role:'team_lead'};assert.ok(!teamPage().includes('onsubmit="saveMember'));assert.equal(roleLabel('team_lead'),'Team lead');`,context);
console.log('PASS: HR/Boss team access controls, exactly three role choices and team-lead management denial');

vm.runInContext(`assert.ok(!settingsPage().includes('Recorded hire milestone'));const milestoneT=tickets.find(t=>t.candidates?.length),milestoneC=milestoneT.candidates[0];candidateOfferDialog(milestoneT.id,milestoneC.id);assert.ok(document.querySelector('#dialog').innerHTML.includes('Recorded hire milestone'));assert.ok(document.querySelector('#dialog').innerHTML.includes('Employee has joined'));`,context);

vm.runInContext(`liveMember={role:'hr',email:'hr@example.test',username:'hr.user'};members=[{name:'Boss',email:'owner@example.test',username:'admin',role:'boss',active:1,isOwner:true,hasLogin:true}];assert.ok(teamPage().includes('Login username'));assert.ok(teamPage().includes('name="password"'));assert.ok(teamPage().includes('Edit account'));assert.ok(!teamPage().includes('onclick="editMember'));assert.ok(teamPage().includes('@cllsystems.com'));assert.equal(companyStaffEmail(' Avery.Quinn '),'avery.quinn@cllsystems.com');ownPasswordDialog();assert.ok(document.querySelector('#dialog').innerHTML.includes('Current password'));assert.ok(document.querySelector('#dialog').innerHTML.includes('Confirm new password'));staffPasswordDialog('owner@example.test');assert.ok(document.querySelector('#dialog').innerHTML.includes('Login username'));assert.ok(document.querySelector('#dialog').innerHTML.includes('Full name'));assert.ok(document.querySelector('#dialog').innerHTML.includes('Business unit'));assert.ok(document.querySelector('#dialog').innerHTML.includes('New password'));liveMember={role:'boss'};staffPasswordDialog('owner@example.test');assert.ok(document.querySelector('#dialog').innerHTML.includes('name="name"'));assert.ok(document.querySelector('#dialog').innerHTML.includes('name="username"'));`,context);

vm.runInContext(`const themeClasses=new Set(['dark']);document.body={classList:{remove:(...names)=>names.forEach(n=>themeClasses.delete(n)),add:n=>themeClasses.add(n)}};applyTheme('warm');assert.ok(themeClasses.has('warm-theme'));assert.ok(!themeClasses.has('dark'));assert.equal(localStorage.getItem('rms-theme'),'warm');chooseTheme('dark');assert.ok(themeClasses.has('dark'));assert.ok(!themeClasses.has('warm-theme'));assert.equal(localStorage.getItem('rms-theme'),'dark');chooseTheme('blue');assert.ok(!themeClasses.has('dark'));assert.equal(localStorage.getItem('rms-theme'),'blue');applyTheme('system');assert.equal(localStorage.getItem('rms-theme'),'system');assert.ok(document.querySelector('#theme-options').innerHTML.includes('System default'));assert.ok(document.querySelector('#theme-options').innerHTML.includes('Soft'));applyTheme('warm',false);assert.equal(document.querySelector('#theme').innerHTML,icon('theme'));`,context);
systemPreference.matches=true;vm.runInContext("applyTheme('system')",context);assert.equal(vm.runInContext("themeClasses.has('dark')",context),true);systemPreference.matches=false;systemThemeChange();assert.equal(vm.runInContext("themeClasses.has('dark')",context),false);vm.runInContext("applyTheme('dark')",context);systemThemeChange();assert.equal(vm.runInContext("themeClasses.has('dark')",context),true);vm.runInContext("applyTheme('warm')",context);
console.log('PASS: appearance menu offers system, light, dark and soft; preferences persist and system changes affect only system mode');

vm.runInContext(`
const pendingTimers=new Map();let timerId=0;globalThis.setTimeout=(fn,ms)=>{pendingTimers.set(++timerId,{fn,ms});return timerId};globalThis.clearTimeout=id=>pendingTimers.delete(id);
let visibleDialogAlert=null;const toastDialog={open:true,querySelector:s=>s==='.dialog-alert'?visibleDialogAlert:s==='.modal-body'?{insertAdjacentHTML(){visibleDialogAlert={textContent:'',setAttribute(){},remove(){visibleDialogAlert=null}}}}:null};document.querySelector('#dialog');
`,context);
elements.set('#dialog',vm.runInContext('toastDialog',context));
vm.runInContext(`toast('Request updated');assert.equal(visibleDialogAlert.textContent,'Request updated');for(const [id,timer] of [...pendingTimers])if(timer.ms===3500){timer.fn();pendingTimers.delete(id)}assert.equal(visibleDialogAlert,null);assert.equal(document.querySelector('#toast').textContent,'');toast('First');toast('Newest');assert.equal(visibleDialogAlert.textContent,'Newest');assert.equal([...pendingTimers.values()].filter(t=>t.ms===3500).length,2);for(const timer of pendingTimers.values())timer.fn();assert.equal(visibleDialogAlert,null);`,context);
console.log('PASS: dialog success message and global toast expire; newer messages replace previous timers');

vm.runInContext(`
const unordered=[{id:'rejected',status:'Rejected',appliedAt:'2026-12-01'},{id:'old',status:'Applied',appliedAt:'2026-10-01'},{id:'hold',status:'On Hold',appliedAt:'2026-10-02'},{id:'hired',status:'Hired',appliedAt:'2026-11-01'},{id:'new',status:'Applied',appliedAt:'2026-10-16',createdAt:'2026-10-16T10:00:00Z'},{id:'withdrawn',status:'Withdrawn',appliedAt:'2026-12-02',offerResponse:'Accepted'},{id:'same-day',status:'Applied',appliedAt:'2026-10-16',createdAt:'2026-10-16T09:00:00Z'},{id:'no-date',status:'Applied'}].map(c=>({t:{id:'HQ-001'},c}));
const originalOrder=unordered.map(r=>r.c.id).join(',');assert.equal(candidateOrder(unordered).map(r=>r.c.id).join(','),'new,same-day,old,no-date,hold,hired,rejected,withdrawn');assert.equal(unordered.map(r=>r.c.id).join(','),originalOrder);
`,context);
console.log('PASS: candidates sort by workflow group, then newest application and creation time; missing dates and withdrawn records remain ordered');

vm.runInContext(`
document.querySelector('#dialog').close=function(){this.open=false};document.querySelector('#dialog').showModal=function(){this.open=true};const originalCatalogue=settings.positionCatalog,originalCatalogueIds=settings.positionCatalogIds;
settings.positionCatalog=['Existing role'];settings.positionCatalogIds={};
const catalogueForm={elements:{namedItem:()=>({value:'Existing role\\nNew engineer\\nNew sales'})}};
const catalogueResult=preparePositionCatalogue(catalogueForm);
assert.ok(document.querySelector('#dialog').innerHTML.includes('Ticket IDs for new positions'));
assert.equal(pendingCatalogue.added.length,2);
confirmCatalogueIds({preventDefault(){},target:{reportValidity:()=>true,elements:{namedItem:name=>({value:name==='catalogId0'?'ASD123':'HQ-850'})}}});
catalogueResult.then(data=>{assert.equal(data.positionCatalogIds['New engineer'],'ASD123');assert.equal(data.positionCatalogIds['New sales'],'HQ-850');});
const cancelledCatalogue=preparePositionCatalogue(catalogueForm);cancelCatalogueIds();cancelledCatalogue.then(data=>assert.equal(data,null));
assert.deepEqual(settings.positionCatalog,['Existing role']);
settings.positionCatalog=originalCatalogue;settings.positionCatalogIds=originalCatalogueIds;
`,context);
console.log('PASS: catalogue detects new titles, prompts for each ID, confirms mappings and cancels without changing saved settings');

vm.runInContext(`liveMember={role:'boss'};members=[{email:'removed@example.test',name:'Deleted User Fixture',role:'team_lead',active:0},{email:'active@example.test',name:'Active User Fixture',role:'team_lead',active:1}];const usersHTML=teamPage();assert.ok(!usersHTML.includes('Deleted User Fixture'));assert.ok(usersHTML.includes('Active User Fixture'));assert.ok(usersHTML.includes('deleteMember(1)'));assert.ok(!usersHTML.includes('Restore access'));`,context);
console.log('PASS: deleted users disappear from the list; delete buttons retain correct member indexes');

vm.runInContext(`const previousTickets=tickets,previousSettings=settings;tickets=[];settings={...settings,positionCatalog:['New Catalogue Fixture'],positionCatalogIds:{'New Catalogue Fixture':'ASD123'}};assert.ok(settingsPage().includes('Manage position details'));assert.ok(managedPositionsHTML().includes('New Catalogue Fixture'));assert.ok(managedPositionsHTML().includes('ASD123'));editCataloguePosition('New Catalogue Fixture');assert.ok(document.querySelector('#dialog').innerHTML.includes('value="ASD123"'));tickets=[{id:'ASD123',title:'New Catalogue Fixture',status:'Draft'}];assert.equal(managedPositionsHTML().split('<strong>New Catalogue Fixture</strong>').length-1,1);tickets=previousTickets;settings=previousSettings;`,context);
console.log('PASS: saved catalogue positions appear without hiring requests and merge with existing tickets without duplicate rows');

vm.runInContext(`const suggestedSalary={requestedSalaryMin:4500,requestedSalaryMax:6500};const requesterFields=requesterSalaryFields(suggestedSalary);assert.ok(requesterFields.includes('name="requestedSalaryMin"'));assert.ok(requesterFields.includes('value="4500"'));const hrSuggested=hrFinanceFields(suggestedSalary);assert.ok(hrSuggested.includes('value="4500"'));assert.ok(hrSuggested.includes('value="6500"'));const hrAdjusted=hrFinanceFields({...suggestedSalary,salaryMin:5000,salaryMax:7000});assert.ok(hrAdjusted.includes('value="5000"'));assert.ok(hrAdjusted.includes('4500 – 6500'));assert.ok(requesterSalaryError({requestedSalaryMin:5000,requestedSalaryMax:4000}));assert.equal(requesterSalaryError({requestedSalaryMin:'',requestedSalaryMax:''}),'');`,context);
console.log('PASS: optional requester salary fields prefill HR review and keep original suggestions visible after HR changes');

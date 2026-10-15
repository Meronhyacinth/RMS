const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const fake = () => ({innerHTML:'',textContent:'',value:'',open:false,classList:{add(){},remove(){}},showModal(){this.open=true},close(){this.open=false}});
const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,fake());return elements.get(selector)}};
const store=new Map();
const context=vm.createContext({document,console,Date,JSON,String,Number,Math,Set,Blob,URL,FormData,assert,location:{hash:'',search:'?demo=1'},URLSearchParams,window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setTimeout(){}});
vm.runInContext(fs.readFileSync(__dirname+'/../public/icons.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/../public/app.js','utf8'),context);
vm.runInContext(fs.readFileSync(__dirname+'/../public/workspace.js','utf8'),context);
vm.runInContext(`
const blocked=tickets.find(t=>t.status==='Pending Approval');
transition(blocked.id,'Sourcing');
assert.equal(blocked.status,'Pending Approval','Unapproved request must not enter sourcing');
const finIndex=blocked.approvals.length-1;
approve(blocked.id,finIndex);
assert.equal(blocked.approvals[finIndex].done,false,'Approvals must follow route order');
blocked.approvals.forEach((_,i)=>approve(blocked.id,i));
assert.equal(blocked.status,'Approved');
transition(blocked.id,'Ready for Recruitment');
assert.equal(blocked.status,'Ready for Recruitment');
transition(blocked.id,'Sourcing');
assert.equal(blocked.status,'Sourcing');
assert.ok(blocked.history.some(e=>e.text.includes('All approvals complete')));
assert.deepEqual(Array.from(route({type:'Replacement',budget:'Budgeted'})),['Hiring Manager']);
assert.deepEqual(Array.from(route({type:'New headcount',budget:'Unbudgeted'})),['Hiring Manager','Business Unit Head','Finance']);
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

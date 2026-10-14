import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const storage=resolve(process.env.RMS_DATA_DIR||resolve(root,'data'));
const origin=new URL(process.env.RMS_PUBLIC_ORIGIN||'http://localhost:3000').origin;
for(const key of ['RMS_OWNER_EMAIL','RMS_ADMIN_PASSWORD_HASH','RMS_SESSION_SECRET'])if(!process.env[key])throw Error('Missing '+key+'. Run the Ubuntu setup command first.');
mkdirSync(storage,{recursive:true});
const sqlite=new DatabaseSync(resolve(storage,'rms.sqlite'));
sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS _rms_migrations (name TEXT PRIMARY KEY, hash TEXT NOT NULL)');
for(const name of readdirSync(resolve(root,'drizzle')).filter(n=>n.endsWith('.sql')).sort()){
 const sql=readFileSync(resolve(root,'drizzle',name),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
 const applied=sqlite.prepare('SELECT hash FROM _rms_migrations WHERE name=?').get(name);
 if(applied){if(applied.hash!==hash)throw Error('Applied migration changed: '+name);continue;}
 sqlite.exec('BEGIN IMMEDIATE');try{sqlite.exec(sql);sqlite.prepare('INSERT INTO _rms_migrations VALUES (?,?)').run(name,hash);sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}
}
const DB={prepare(sql){return {bind(...args){const query=sqlite.prepare(sql);return {first(){return query.get(...args)||null;},all(){return {results:query.all(...args)};},run(){const r=query.run(...args);return {meta:{changes:Number(r.changes)}};}};}};},batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const uploadRoot=resolve(storage,'files');mkdirSync(uploadRoot,{recursive:true});
const filePath=key=>{const p=resolve(uploadRoot,key);if(!p.startsWith(uploadRoot+sep))throw Error('Invalid attachment path');return p;};
const BUCKET={async put(key,data){const p=filePath(key);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,Buffer.from(data),{mode:0o600});},async get(key){const p=filePath(key);return existsSync(p)?{body:readFileSync(p)}:null;},async delete(key){const p=filePath(key);if(existsSync(p))unlinkSync(p);}};
const env={...process.env,DB,BUCKET};
function load(file,context={}){
 const original=readFileSync(resolve(root,'lib',file),'utf8');
 const names=[...original.matchAll(/export\s+(?:async\s+)?(?:const|function)\s+(\w+)/g)].map(m=>m[1]);
 const code=stripTypeScriptTypes(original,{mode:'strip'}).replace(/^import[^\n]*\n/gm,'').replace(/\bexport\s+/g,'');
 return new Function(...Object.keys(context),code+'\nreturn {'+names.join(',')+'};')(...Object.values(context));
}
const rules=load('rules.ts'),auth=load('password-auth.ts',{env});
const original=readFileSync(resolve(root,'lib/server.ts'),'utf8');
const code=stripTypeScriptTypes(original,{mode:'strip'}).replace(/^import[^\n]*\n/gm,'').replace(/\bexport\s+/g,'');
const {handle}=new Function('env','rules','auth','getChatGPTUser',`const {${Object.keys(rules).join(',')}}=rules;const {${Object.keys(auth).join(',')}}=auth;${code}\nreturn {handle};`)(env,rules,auth,async()=>null);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname.startsWith('/api/rms/')){
  const parts=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>12*1024*1024){res.writeHead(413);res.end('Upload is too large');return;}parts.push(part);}
  const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
  // Trust the actual socket, never an attacker-supplied Cloudflare/IP header.
  headers.set('cf-connecting-ip',req.socket.remoteAddress||'unknown');
  const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});
  const response=await handle(request);res.statusCode=response.status;
  response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});
  if(response.headers.getSetCookie().length)res.setHeader('Set-Cookie',response.headers.getSetCookie());
  res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
 const publicRoot=resolve(root,'public'),path=resolve(publicRoot,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!path.startsWith(publicRoot+sep)||!existsSync(path)){res.writeHead(404);res.end('Not found');return;}
 const ext=path.slice(path.lastIndexOf('.'));res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-cache');
 res.end(req.method==='HEAD'?undefined:readFileSync(path));
 }catch(e){console.error('RMS request failed:',e.message);if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end('{"error":"The server could not complete this request."}');}});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('RMS listening on port '+(process.env.PORT||3000)));
process.on('SIGTERM',()=>server.close(()=>{sqlite.close();process.exit(0);}));

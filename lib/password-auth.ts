import {env} from 'cloudflare:workers';

type AuthEnv={RMS_ADMIN_PASSWORD_HASH?:string;RMS_SESSION_SECRET?:string;RMS_OWNER_EMAIL?:string;RMS_HTTP_DEV_MODE?:string};
const cfg=env as unknown as AuthEnv;
const enc=new TextEncoder();
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const httpMode=cfg.RMS_HTTP_DEV_MODE==='true';
const cookie=httpMode?'rms-session':'__Host-rms-session';
const cookieFlags=httpMode?'HttpOnly; SameSite=Lax; Path=/':'HttpOnly; Secure; SameSite=None; Partitioned; Path=/';
const ttl=8*60*60;
export const passwordLoginEnabled=()=>!!(cfg.RMS_ADMIN_PASSWORD_HASH&&cfg.RMS_SESSION_SECRET&&cfg.RMS_OWNER_EMAIL);
async function key(){return crypto.subtle.importKey('raw',enc.encode(cfg.RMS_SESSION_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function verifyPassword(password:string,storedHash=cfg.RMS_ADMIN_PASSWORD_HASH!){try{
 const [scheme,count,salt,expected]=storedHash.split('$');
 if(scheme!=='pbkdf2-sha256'||+count!==100000)return false;
 const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:+count,hash:'SHA-256'},material,256));
 const target=unb64(expected);let diff=bytes.length^target.length;for(let i=0;i<bytes.length;i++)diff|=bytes[i]^(target[i]||0);return diff===0;
 }catch{return false;}}
export async function sessionCookie(user?:{email:string;name:string;version:number}){const now=Math.floor(Date.now()/1000),payload=b64(enc.encode(JSON.stringify({username:user?'staff':'admin',email:user?user.email:cfg.RMS_OWNER_EMAIL!.toLowerCase(),name:user?.name,version:user?.version,exp:now+ttl,nonce:crypto.randomUUID()})));const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),enc.encode(payload))));return `${cookie}=${payload}.${signature}; ${cookieFlags}; Max-Age=${ttl}`;}
export const logoutCookie=()=>`${cookie}=; ${cookieFlags}; Max-Age=0`;
export async function sessionUser(req:Request){try{
 const value=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);if(!value||value.length>2000)return null;
 const parts=value.split('.');if(parts.length!==2||!await crypto.subtle.verify('HMAC',await key(),unb64(parts[1]),enc.encode(parts[0])))return null;
 const p=JSON.parse(new TextDecoder().decode(unb64(parts[0])));if(!['admin','staff'].includes(p.username)||typeof p.email!=='string'||(p.username==='admin'&&p.email!==cfg.RMS_OWNER_EMAIL!.toLowerCase())||!Number.isInteger(p.exp)||p.exp<=Date.now()/1000)return null;
 return {userId:p.username==='admin'?'password-admin':'password:'+p.email,email:p.email,displayName:p.name||'Admin',authVersion:p.username==='staff'?p.version:undefined};
 }catch{return null;}}

export const clearLegacyCookie=()=>`__Host-rms-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

export async function hashPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},material,256));return 'pbkdf2-sha256$100000$'+b64(salt)+'$'+b64(bytes);}

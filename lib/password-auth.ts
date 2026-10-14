import {env} from 'cloudflare:workers';

type AuthEnv={RMS_ADMIN_PASSWORD_HASH?:string;RMS_SESSION_SECRET?:string;RMS_OWNER_EMAIL?:string};
const cfg=env as unknown as AuthEnv;
const enc=new TextEncoder();
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const cookie='__Host-rms-session';
const ttl=8*60*60;
export const passwordLoginEnabled=()=>!!(cfg.RMS_ADMIN_PASSWORD_HASH&&cfg.RMS_SESSION_SECRET&&cfg.RMS_OWNER_EMAIL);
async function key(){return crypto.subtle.importKey('raw',enc.encode(cfg.RMS_SESSION_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function verifyPassword(password:string){try{
 const [scheme,count,salt,expected]=cfg.RMS_ADMIN_PASSWORD_HASH!.split('$');
 if(scheme!=='pbkdf2-sha256'||+count!==100000)return false;
 const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unb64(salt),iterations:+count,hash:'SHA-256'},material,256));
 const target=unb64(expected);let diff=bytes.length^target.length;for(let i=0;i<bytes.length;i++)diff|=bytes[i]^(target[i]||0);return diff===0;
 }catch{return false;}}
export async function sessionCookie(){const now=Math.floor(Date.now()/1000),payload=b64(enc.encode(JSON.stringify({username:'admin',email:cfg.RMS_OWNER_EMAIL!.toLowerCase(),exp:now+ttl,nonce:crypto.randomUUID()})));const signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(),enc.encode(payload))));return `${cookie}=${payload}.${signature}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=${ttl}`;}
export const logoutCookie=()=>`${cookie}=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0`;
export async function sessionUser(req:Request){try{
 const value=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookie+'='))?.slice(cookie.length+1);if(!value||value.length>2000)return null;
 const parts=value.split('.');if(parts.length!==2||!await crypto.subtle.verify('HMAC',await key(),unb64(parts[1]),enc.encode(parts[0])))return null;
 const p=JSON.parse(new TextDecoder().decode(unb64(parts[0])));if(p.username!=='admin'||p.email!==cfg.RMS_OWNER_EMAIL!.toLowerCase()||!Number.isInteger(p.exp)||p.exp<=Date.now()/1000)return null;
 return {userId:'password-admin',email:p.email,displayName:'Admin'};
 }catch{return null;}}

export const clearLegacyCookie=()=>`${cookie}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

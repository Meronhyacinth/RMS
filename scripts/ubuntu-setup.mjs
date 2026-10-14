import {writeFileSync,existsSync} from 'node:fs';
import {pbkdf2Sync,randomBytes} from 'node:crypto';
const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const origin=new URL(option('--origin','http://localhost'));
if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password)throw Error('Use an http:// or https:// server address.');
const email=option('--email','admin@rms.local');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Enter a valid administrator email.');
if(existsSync('.env'))throw Error('.env already exists. Back it up or edit it; setup does not overwrite existing credentials.');
if(!process.stdin.isTTY)throw Error('Run interactively (docker run -it) so the password can be entered privately.');
async function secret(prompt){process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();return new Promise((resolve,reject)=>{let value='';const onData=buffer=>{for(const c of buffer.toString()){if(c==='\u0003'){process.stdin.setRawMode(false);process.stdin.pause();reject(Error('Cancelled'));return;}if(c==='\r'||c==='\n'){process.stdin.off('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');resolve(value);return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else value+=c;}};process.stdin.on('data',onData);});}
const password=await secret('Set the admin password (input hidden): '),again=await secret('Confirm password: ');
if(!password||password!==again)throw Error('Passwords do not match.');
const salt=randomBytes(16),hash='pbkdf2-sha256$100000$'+salt.toString('base64url')+'$'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64url');
const values={RMS_PUBLIC_ORIGIN:origin.origin,RMS_OWNER_EMAIL:email,RMS_ADMIN_PASSWORD_HASH:hash,RMS_SESSION_SECRET:randomBytes(48).toString('base64url'),RMS_HTTP_DEV_MODE:origin.protocol==='http:'?'true':'false',RMS_DATA_DIR:'/data',PORT:'3000'};
writeFileSync('.env',Object.entries(values).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n',{mode:0o600});console.log('Configuration saved. Username: admin');

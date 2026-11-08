/** W1 Windows device enrollment: no Access JWT/Cookie is copied to Windows.
 * An authenticated browser issues a one-use 256-bit code. The desktop redeems
 * it through a narrow, fail-closed endpoint. Only digests persist in storage.
 */
import { DEVICE_ID_RE } from "./signaling";

export const PAIR_CODE_TTL_MS = 2 * 60 * 1000;
export const DEVICE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const INVITE = "nm1i_", TOKEN = "nm1t_";
const SECURE_CODE = /^[a-zA-Z0-9_-]{43}$/;

export interface DeviceStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: {prefix: string}): Promise<Map<string, T>>;
}
export type DeviceInfo = {id: string; name: string; expires_at: number};
type InviteRecord = {sub: string; expires_at: number};
type DeviceRecord = DeviceInfo & {token_hash: string};
type TokenRecord = {sub: string; id: string; expires_at: number};

const keyFor = (sub:string,id:string) => "dev:" + encodeURIComponent(sub) + ":" + id;
const tokenKey = (hash:string) => "token:" + hash;
const inviteOwnerKey = (sub:string) => "owner-invite:" + encodeURIComponent(sub);
function fresh(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return prefix + btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
export async function secretDigest(secret: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), x=>x.toString(16).padStart(2,"0")).join("");
}
export function validPairCode(value: unknown): value is string {
  return typeof value==="string" && value.startsWith(INVITE) &&
    SECURE_CODE.test(value.slice(INVITE.length));
}
export function validDeviceToken(value: unknown): value is string {
  return typeof value==="string" && value.startsWith(TOKEN) &&
    SECURE_CODE.test(value.slice(TOKEN.length));
}
export function validDesktop(value: unknown): value is {id:string;name:string} {
  if(!value || typeof value!=="object") return false;
  const v=value as Record<string,unknown>;
  return typeof v.id==="string" && DEVICE_ID_RE.test(v.id) &&
    typeof v.name==="string" && v.name.trim().length>0 &&
    new TextEncoder().encode(v.name).length<=80 &&
    !/[\u0000-\u001f\u007f]/.test(v.name);
}
export async function issueCode(store:DeviceStore,sub:string,now=Date.now()){
  if(!sub || sub.length>500) throw new Error("Invalid owner");
  const code=fresh(INVITE),expires_at=now+PAIR_CODE_TTL_MS;
  const hash=await secretDigest(code),index=inviteOwnerKey(sub);
  const older=await store.get<string>(index);
  if(older)await store.delete("invite:"+older);
  await store.put<InviteRecord>("invite:"+hash,{sub,expires_at});
  await store.put<string>(index,hash);
  return {code,expires_at};
}
export async function claimCode(
  store:DeviceStore,code:unknown,device:unknown,now=Date.now()
):Promise<{token:string;expires_at:number}|null>{
  if(!validPairCode(code)||!validDesktop(device))return null;
  const hashCode=await secretDigest(code),inviteKey="invite:"+hashCode;
  const invite=await store.get<InviteRecord>(inviteKey);
  if(!invite || invite.expires_at<=now) {
    if(invite){
      await store.delete(inviteKey);
      const index=inviteOwnerKey(invite.sub);
      if(await store.get<string>(index)===hashCode)await store.delete(index);
    }
    return null;
  }
  const token=fresh(TOKEN),hash=await secretDigest(token),expires_at=now+DEVICE_SESSION_TTL_MS;
  const key=keyFor(invite.sub,device.id);
  const previous=await store.get<DeviceRecord>(key);
  if(previous)await store.delete(tokenKey(previous.token_hash));
  await store.put<DeviceRecord>(key,{id:device.id,name:device.name.trim(),expires_at,token_hash:hash});
  await store.put<TokenRecord>(tokenKey(hash),{sub:invite.sub,id:device.id,expires_at});
  await store.delete(inviteKey);
  const index=inviteOwnerKey(invite.sub);
  if(await store.get<string>(index)===hashCode)await store.delete(index);
  return {token,expires_at};
}
export async function authenticateDevice(
  store:DeviceStore,token:unknown,id:unknown,now=Date.now()
):Promise<(DeviceInfo&{sub:string})|null>{
  if(!validDeviceToken(token)||typeof id!=="string"||!DEVICE_ID_RE.test(id))return null;
  const hash=await secretDigest(token);
  const session=await store.get<TokenRecord>(tokenKey(hash));
  if(!session)return null;
  if(session.expires_at<=now){await store.delete(tokenKey(hash));return null;}
  if(session.id!==id)return null;
  const current=await store.get<DeviceRecord>(keyFor(session.sub,id));
  if(!current || current.expires_at<=now || current.token_hash!==hash)return null;
  return {sub:session.sub,id,name:current.name,expires_at:current.expires_at};
}
export async function listedDevices(store:DeviceStore,sub:string,now=Date.now()):Promise<DeviceInfo[]>{
  if(!sub||sub.length>500)return [];
  const records=await store.list<DeviceRecord>({prefix:"dev:"+encodeURIComponent(sub)+":"});
  const active:DeviceInfo[]=[];
  for(const [key,device] of records){
    if(device.expires_at<=now){
      await store.delete(tokenKey(device.token_hash));
      await store.delete(key);
    }else active.push({id:device.id,name:device.name,expires_at:device.expires_at});
  }
  return active.sort((a,b)=>a.name.localeCompare(b.name,"zh"));
}
export async function revokeDevice(store:DeviceStore,sub:string,id:unknown):Promise<boolean>{
  if(!sub||sub.length>500||typeof id!=="string"||!DEVICE_ID_RE.test(id))return false;
  const key=keyFor(sub,id),device=await store.get<DeviceRecord>(key);
  if(!device)return false;
  await store.delete(tokenKey(device.token_hash));
  await store.delete(key);
  return true;
}

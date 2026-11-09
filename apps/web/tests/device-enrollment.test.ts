import {describe,it,expect} from "vitest";
import {authenticateDevice,claimCode,issueCode,listedDevices,revokeDevice,
  validDesktop,validPairCode,validDeviceToken,secretDigest,
  PAIR_CODE_TTL_MS,DEVICE_SESSION_TTL_MS,type DeviceStore} from "../src/deviceEnrollment";

class MemoryStore implements DeviceStore {
  values=new Map<string,unknown>();
  async get<T>(key:string){return this.values.get(key) as T|undefined;}
  async put<T>(key:string,value:T){this.values.set(key,value);}
  async delete(key:string){return this.values.delete(key);}
  async list<T>({prefix}:{prefix:string}){return new Map([...this.values].filter(([k])=>k.startsWith(prefix))) as Map<string,T>;}
}
const id="28560890-e97d-4fab-83c8-937b816d10cd";
const other="18aba838-246f-4d0e-af08-1a27b536932a";
const device={id,name:"Windows 工作站"};
const time=1_800_000_000_000;

describe("W1 Windows device enrollment security",()=>{
  it("one-time 256-bit code is bound to an Access account, expires after 2m",async()=>{
    const store=new MemoryStore();
    const {code,expires_at}=await issueCode(store,"account-A",time);
    expect(validPairCode(code)).toBe(true);
    expect(code.length).toBe(48);
    expect(expires_at).toBe(time+PAIR_CODE_TTL_MS);
    expect([...store.values.keys()].every(k=>!k.includes(code))).toBe(true);
    expect(await claimCode(store,code,device,time+100)).toMatchObject({expires_at:time+100+DEVICE_SESSION_TTL_MS});
    expect(await claimCode(store,code,{id:other,name:"attacker"},time+200)).toBeNull();
    const fresh=await issueCode(store,"account-B",time);
    expect(await claimCode(store,fresh.code,device,time+PAIR_CODE_TTL_MS)).toBeNull();
    expect(await listedDevices(store,"account-B",time)).toEqual([]);
    expect((await listedDevices(store,"account-A",time)).map(d=>d.id)).toEqual([id]);
  });
  it("issuing a new pairing code invalidates the previous unused code and bounds stored invites",async()=>{
    const store=new MemoryStore();
    const first=await issueCode(store,"A",time);
    const second=await issueCode(store,"A",time+1);
    expect(await claimCode(store,first.code,device,time+2)).toBeNull();
    expect([...store.values.keys()].filter(k=>k.startsWith("invite:"))).toHaveLength(1);
    expect(await claimCode(store,second.code,device,time+3)).toBeTruthy();
    expect([...store.values.keys()].filter(k=>k.startsWith("invite:"))).toHaveLength(0);
    expect(await listedDevices(store,"A",time+DEVICE_SESSION_TTL_MS+5)).toEqual([]);
    expect([...store.values.keys()].filter(k=>k.startsWith("dev:"))).toHaveLength(0);
  });
  it("device token authenticates exactly the issued device and account, not browser cookies",async()=>{
    const store=new MemoryStore(),code=(await issueCode(store,"A",time)).code;
    const claim=await claimCode(store,code,device,time+1);
    expect(claim).not.toBeNull();
    const token=claim!.token;
    expect(validDeviceToken(token)).toBe(true);
    expect(token).not.toBe(code);
    expect(await authenticateDevice(store,token,id,time+2)).toMatchObject({sub:"A",id,name:device.name});
    expect(await authenticateDevice(store,token,other,time+2)).toBeNull();
    expect(await authenticateDevice(store,"Bearer "+token,id,time+2)).toBeNull();
    expect(await authenticateDevice(store,token,id,time+DEVICE_SESSION_TTL_MS+2)).toBeNull();
    const digest=await secretDigest(token);
    expect(JSON.stringify(await listedDevices(store,"A",time+2))).not.toContain(digest);
    expect(JSON.stringify([...store.values])).not.toContain(token);
  });
  it("revoke only by owning Access account; replacing device invalidates previous token",async()=>{
    const store=new MemoryStore(),code=(await issueCode(store,"A",time)).code;
    const first=await claimCode(store,code,device,time);
    const second=await claimCode(store,(await issueCode(store,"A",time)).code,device,time+1);
    expect(await authenticateDevice(store,first!.token,id,time+2)).toBeNull();
    expect(await authenticateDevice(store,second!.token,id,time+2)).toBeTruthy();
    expect(await revokeDevice(store,"B",id)).toBe(false);
    expect(await authenticateDevice(store,second!.token,id,time+2)).toBeTruthy();
    expect(await revokeDevice(store,"A",id)).toBe(true);
    expect(await authenticateDevice(store,second!.token,id,time+3)).toBeNull();
  });
  it("rejects malformed claims and devices without consuming the one-time code",async()=>{
    const store=new MemoryStore(),code=(await issueCode(store,"A",time)).code;
    for(const invalid of [
      {id:"../../test",name:"Windows"}, {id,name:""}, {id,name:"x".repeat(81)},
      {id,name:"bad\u0000name"},null
    ]) {
      expect(validDesktop(invalid)).toBe(false);
      expect(await claimCode(store,code,invalid,time)).toBeNull();
    }
    expect(await claimCode(store,code,device,time)).not.toBeNull();
    expect(await authenticateDevice(store,"nm1t_"+"x".repeat(43),id,time)).toBeNull();
    expect(await revokeDevice(store,"A","../test")).toBe(false);
  });
});

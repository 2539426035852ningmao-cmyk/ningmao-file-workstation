/** Account-bound W1 Windows device grants.
 * The Worker is the only caller; this DO is never directly exposed as an HTTP route.
 * A 256-bit one-time code grants a single 24-hour, revocable device credential.
 */
import {DurableObject} from "cloudflare:workers";
import {authenticateDevice,claimCode,issueCode,listedDevices,revokeDevice} from "../src/deviceEnrollment";

interface Env {}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
export class DeviceRegistry extends DurableObject<Env> {
  async fetch(request:Request):Promise<Response>{
    if(request.method!=="POST")return json({error:"method_not_allowed"},405);
    let raw="";
    try{raw=await request.text();}catch{return json({error:"invalid_body"},400);}
    if(raw.length>2048)return json({error:"too_large"},413);
    let body:Record<string,unknown>;
    try{const parsed:unknown=JSON.parse(raw);if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new Error();body=parsed as Record<string,unknown>;}
    catch{return json({error:"invalid_json"},400);}
    const sub=typeof body.sub==="string"?body.sub:"";
    const uri=new URL(request.url).pathname;
    switch(uri){
      case "/issue": {
        if(!sub||sub.length>500)return json({error:"invalid_owner"},400);
        return json(await issueCode(this.ctx.storage,sub));
      }
      case "/claim": {
        // Only one redemption can win, even if claim requests race across networks.
        const claimed=await this.ctx.storage.transaction(tx=>claimCode(tx,body.code,body.device));
        return claimed?json(claimed):json({error:"invalid_or_expired_code"},403);
      }
      case "/verify": {
        const verified=await authenticateDevice(this.ctx.storage,body.token,body.id);
        return verified?json(verified):json({error:"unauthorized"},401);
      }
      case "/list": {
        if(!sub||sub.length>500)return json({error:"invalid_owner"},400);
        return json({devices:await listedDevices(this.ctx.storage,sub)});
      }
      case "/revoke": {
        if(!sub||sub.length>500)return json({error:"invalid_owner"},400);
        const removed=await this.ctx.storage.transaction(tx=>revokeDevice(tx,sub,body.id));
        return json({removed});
      }
      default:return json({error:"not_found"},404);
    }
  }
}

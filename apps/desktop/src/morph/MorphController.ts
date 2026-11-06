export type Mode="orb"|"capsule"|"full";
export type Frame={width:number;height:number;radius:number};
export type Motion=Frame&{mode:Mode;animating:boolean};

// One scheduler and one in-flight native resize per host. Reversal starts at
// the last acknowledged frame, never at an old endpoint.
export class MorphController {
  frame:Frame={width:420,height:520,radius:20};
  full:Frame={...this.frame};
  mode:Mode="full";
  private target:Mode="full";
  private blocked=false;
  private alive=false;
  private running=false;
  private raf=0;
  private revision=0;
  private settle:((ok:boolean)=>void)|undefined;
  constructor(private apply:(frame:Frame)=>Promise<Frame>,private publish:(value:Motion)=>void,private failed:(message:string)=>void){}
  connect(full:Frame){this.alive=true;this.full=full;this.frame=full;this.emit(false);}
  destroy(){this.alive=false;cancelAnimationFrame(this.raf);this.running=false;this.settle?.(false);this.settle=undefined;}
  private emit(animating:boolean){this.publish({...this.frame,mode:this.mode,animating});}
  private endpoint():Frame{return this.target==="full"?this.full:this.target==="orb"?{width:48,height:48,radius:24}:{width:288,height:72,radius:36};}
  move(mode:Mode):Promise<boolean>{
    this.settle?.(false);this.target=mode;this.revision++;
    const settled=new Promise<boolean>(resolve=>{this.settle=resolve;});
    this.start();return settled;
  }
  block(value:boolean){this.blocked=value;if(!value)this.start();}
  private start(){
    if(!this.alive||this.blocked||this.running||!this.settle)return;
    this.running=true;
    let from={...this.frame},started=performance.now(),revision=this.revision;
    const tick=async(now:number)=>{
      if(!this.alive||this.blocked){this.running=false;this.emit(false);return;}
      if(revision!==this.revision){from={...this.frame};started=now;revision=this.revision;}
      const to=this.endpoint(),t=matchMedia('(prefers-reduced-motion: reduce)').matches?1:Math.min(1,(now-started)/240),ease=1-Math.pow(1-t,3);
      const next=t===1?to:{width:from.width+(to.width-from.width)*ease,height:from.height+(to.height-from.height)*ease,radius:from.radius+(to.radius-from.radius)*ease};
      try{const actual=await this.apply(next);if(!this.alive)return;this.frame=actual;}
      catch(e){this.running=false;this.emit(false);this.settle?.(false);this.settle=undefined;this.failed(String(e));return;}
      if(t===1&&revision===this.revision){this.mode=this.target;this.running=false;this.emit(false);this.settle?.(true);this.settle=undefined;return;}
      this.emit(true);this.raf=requestAnimationFrame(tick);
    };
    this.raf=requestAnimationFrame(tick);
  }
}

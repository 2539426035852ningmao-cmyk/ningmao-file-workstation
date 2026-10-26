// Original Ningmao motion. A critically damped step, not third-party pose data.
export class OrbMotionController {
  private frame=0; private timer=0; private last=0; private blinkStart=0;
  private x=0; private y=0; private vx=0; private vy=0; private tx=0; private ty=0;
  private disposed=false;
  private reduced=matchMedia("(prefers-reduced-motion: reduce)");
  constructor(private svg:SVGSVGElement,private host:HTMLElement) {
    host.addEventListener("pointermove",this.point);
    host.addEventListener("pointerleave",this.leave);
    document.addEventListener("visibilitychange",this.visibility);
    this.reduced.addEventListener("change",this.visibility);
    this.visibility();
  }
  private enabled=()=>!this.disposed && !document.hidden && !this.reduced.matches;
  private scheduleBlink=()=>{
    clearTimeout(this.timer);
    if(this.enabled())this.timer=window.setTimeout(()=>{this.blinkStart=performance.now();this.wake();},4600+Math.random()*3400);
  };
  private point=(event:PointerEvent)=>{
    if(!this.enabled())return;
    const rect=this.svg.getBoundingClientRect();
    this.tx=Math.max(-2.2,Math.min(2.2,(event.clientX-rect.left-rect.width/2)/rect.width*5));
    this.ty=Math.max(-1.6,Math.min(1.6,(event.clientY-rect.top-rect.height/2)/rect.height*4));
    this.wake();
  };
  private leave=()=>{this.tx=this.ty=0;this.wake();};
  private wake=()=>{if(this.enabled() && !this.frame){this.last=performance.now();this.frame=requestAnimationFrame(this.tick);}};
  private tick=(time:number)=>{
    this.frame=0;if(!this.enabled())return;
    const dt=Math.min(.05,Math.max(0,(time-this.last)/1000));this.last=time;
    const step=(value:number,velocity:number,target:number)=>{const d=value-target,c=velocity+24*d,e=Math.exp(-24*dt);return [target+(d+c*dt)*e,(velocity-24*c*dt)*e];};
    [this.x,this.vx]=step(this.x,this.vx,this.tx);[this.y,this.vy]=step(this.y,this.vy,this.ty);
    let opening=1;
    if(this.blinkStart){const t=(time-this.blinkStart)/140;opening=t<1?Math.max(.08,Math.abs(2*t-1)):1;if(t>=1){this.blinkStart=0;this.scheduleBlink();}}
    this.svg.style.setProperty("--gaze-x",`${this.x.toFixed(3)}px`);
    this.svg.style.setProperty("--gaze-y",`${this.y.toFixed(3)}px`);
    this.svg.style.setProperty("--eye-open",String(opening));
    if(this.blinkStart || Math.abs(this.x-this.tx)+Math.abs(this.y-this.ty)+Math.abs(this.vx)+Math.abs(this.vy)>.015)this.frame=requestAnimationFrame(this.tick);
  };
  private visibility=()=>{
    cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.frame=0;this.blinkStart=0;
    this.x=this.y=this.vx=this.vy=this.tx=this.ty=0;
    this.svg.style.removeProperty("--gaze-x");this.svg.style.removeProperty("--gaze-y");this.svg.style.removeProperty("--eye-open");
    if(this.enabled())this.scheduleBlink();
  };
  destroy(){this.disposed=true;cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.frame=0;this.svg.style.removeProperty("--gaze-x");this.svg.style.removeProperty("--gaze-y");this.svg.style.removeProperty("--eye-open");this.host.removeEventListener("pointermove",this.point);this.host.removeEventListener("pointerleave",this.leave);document.removeEventListener("visibilitychange",this.visibility);this.reduced.removeEventListener("change",this.visibility);}
}

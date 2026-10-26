// Original independent, critically damped eye motion. No idle RAF loop.
export class OrbMotionController {
 private frame=0;private timer=0;private last=0;private blinkStart=0;
 private x=0;private y=0;private vx=0;private vy=0;private rx=0;private ry=0;private rvx=0;private rvy=0;private tx=0;private ty=0;
 private disposed=false;private locked=false;private reduced=matchMedia("(prefers-reduced-motion: reduce)");
 constructor(private svg:SVGSVGElement,private host:HTMLElement,private gain=1){host.addEventListener("pointermove",this.point);host.addEventListener("pointerleave",this.leave);host.addEventListener("ningmao-near-pointer",this.near);window.addEventListener("ningmao-window-motion",this.motion);document.addEventListener("visibilitychange",this.visibility);this.reduced.addEventListener("change",this.visibility);this.locked=document.documentElement.dataset.windowMoving==="true";this.visibility();}
 private enabled=()=>!this.disposed && !this.locked && !document.hidden && !this.reduced.matches;
 private scheduleBlink=()=>{clearTimeout(this.timer);if(this.enabled())this.timer=window.setTimeout(()=>{this.blinkStart=performance.now();this.wake();},(this.gain<.5?10000:4600)+Math.random()*3400);};
 private target=(x:number,y:number)=>{const r=this.svg.getBoundingClientRect();if(!r.width || !r.height)return;this.tx=Math.max(-2.2,Math.min(2.2,(x-r.left-r.width/2)/r.width*5))*this.gain;this.ty=Math.max(-1.6,Math.min(1.6,(y-r.top-r.height/2)/r.height*4))*this.gain;this.wake();};
 private point=(e:PointerEvent)=>{if(!this.enabled())return;this.target(e.clientX,e.clientY);};
 private near=(e:Event)=>{if(!this.enabled())return;const p=(e as CustomEvent<{x:number;y:number}|null>).detail;if(p)this.target(p.x,p.y);else this.leave();};
 private leave=()=>{this.tx=this.ty=0;this.wake();};
 private motion=(e:Event)=>{this.locked=!!(e as CustomEvent<boolean>).detail;if(this.locked){cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.frame=0;this.blinkStart=0;}else{this.scheduleBlink();this.wake();}};
 private wake=()=>{if(this.enabled()&&!this.frame){this.last=performance.now();this.frame=requestAnimationFrame(this.tick);}};
 private tick=(time:number)=>{this.frame=0;if(!this.enabled())return;const dt=Math.min(.05,Math.max(0,(time-this.last)/1000));this.last=time;const step=(v:number,s:number,t:number,w:number)=>{const d=v-t,c=s+w*d,e=Math.exp(-w*dt);return [t+(d+c*dt)*e,(s-w*c*dt)*e];};
 [this.x,this.vx]=step(this.x,this.vx,this.tx,24);[this.y,this.vy]=step(this.y,this.vy,this.ty,24);[this.rx,this.rvx]=step(this.rx,this.rvx,this.tx*.94,22.5);[this.ry,this.rvy]=step(this.ry,this.rvy,this.ty*.94,22.5);
 let open=1;if(this.blinkStart){const t=(time-this.blinkStart)/140;open=t<1?Math.max(.08,Math.abs(2*t-1)):1;if(t>=1){this.blinkStart=0;this.scheduleBlink();}}
 for(const [key,value] of Object.entries({"--gaze-x":this.x,"--gaze-y":this.y,"--gaze-right-x":this.rx,"--gaze-right-y":this.ry}))this.svg.style.setProperty(key,`${value.toFixed(3)}px`);this.svg.style.setProperty("--eye-open",String(open));
 if(this.blinkStart || Math.abs(this.x-this.tx)+Math.abs(this.y-this.ty)+Math.abs(this.vx)+Math.abs(this.vy)+Math.abs(this.rx-this.tx*.94)+Math.abs(this.ry-this.ty*.94)+Math.abs(this.rvx)+Math.abs(this.rvy)>.015)this.frame=requestAnimationFrame(this.tick);
 };
 private reset=()=>{for(const key of ["--gaze-x","--gaze-y","--gaze-right-x","--gaze-right-y","--eye-open"])this.svg.style.removeProperty(key);};
 private visibility=()=>{cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.frame=0;this.blinkStart=0;this.x=this.y=this.vx=this.vy=this.rx=this.ry=this.rvx=this.rvy=this.tx=this.ty=0;this.reset();if(this.enabled())this.scheduleBlink();};
 destroy(){this.disposed=true;cancelAnimationFrame(this.frame);clearTimeout(this.timer);this.reset();this.host.removeEventListener("pointermove",this.point);this.host.removeEventListener("pointerleave",this.leave);this.host.removeEventListener("ningmao-near-pointer",this.near);window.removeEventListener("ningmao-window-motion",this.motion);document.removeEventListener("visibilitychange",this.visibility);this.reduced.removeEventListener("change",this.visibility);}
}

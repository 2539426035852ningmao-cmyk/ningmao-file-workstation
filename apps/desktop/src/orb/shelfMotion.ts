// The shell changes shape; its contents keep their natural size throughout.
const running=new WeakMap<HTMLElement,Animation>();
export async function shapeShelf(node:HTMLElement,open:boolean,initial=false):Promise<boolean>{
  const previous=running.get(node),current=getComputedStyle(node).clipPath;
  previous?.cancel();
  const compact=`inset(0px ${Math.max(0,node.clientWidth-54)}px ${Math.max(0,node.clientHeight-48)}px 6px round 24px)`;
  const full="inset(0px 0px 0px 0px round 20px)",target=open?full:compact;
  node.dataset.shape=open?"opening":"closing";
  if(matchMedia("(prefers-reduced-motion: reduce)").matches||document.documentElement.dataset.reduceMotion==="true"){
    node.style.clipPath=target;node.dataset.shape=open?"open":"closed";return true;
  }
  const animation=node.animate([{clipPath:initial?compact:current==="none"?full:current},{clipPath:target}],{duration:open?260:210,easing:"cubic-bezier(.22,.8,.24,1)",fill:"forwards"});
  running.set(node,animation);
  try{await animation.finished;}catch{return false;}
  if(running.get(node)!==animation)return false;
  node.style.clipPath=target;animation.cancel();running.delete(node);node.dataset.shape=open?"open":"closed";return true;
}
export function stopShelfMotion(node:HTMLElement){running.get(node)?.cancel();running.delete(node);}

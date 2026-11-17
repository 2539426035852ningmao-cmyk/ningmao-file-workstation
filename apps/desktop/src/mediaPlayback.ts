// Workspace WebViews share an origin/profile; notifications never start playback.
let current={key:'',stamp:0};
const event='ningmao-media-claim',storageKey='ningmao-media-claim-v1';
const channel=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(event);
function receive(value:{key:string;stamp:number}){if(typeof value?.key!=='string'||!Number.isFinite(value.stamp)||value.stamp<current.stamp||(value.stamp===current.stamp&&value.key<=current.key))return;current=value;window.dispatchEvent(new CustomEvent(event,{detail:value.key}));}
channel?.addEventListener('message',e=>receive(e.data));
window.addEventListener('storage',e=>{if(e.key===storageKey&&e.newValue){try{receive(JSON.parse(e.newValue));}catch{/* Ignore unrelated/corrupt storage. */}}});
export function claimPlayback(key:string){const value={key,stamp:Math.max(Date.now(),current.stamp+.001)};receive(value);channel?.postMessage(value);try{localStorage.setItem(storageKey,JSON.stringify(value));}catch{/* BroadcastChannel still owns cross-window handoff. */}}
export function ownsPlayback(key:string){return current.key===key;}
export function observePlayback(key:string,stop:()=>void){const listener=(e:Event)=>{if((e as CustomEvent<string>).detail!==key)stop();};window.addEventListener(event,listener);return()=>window.removeEventListener(event,listener);}

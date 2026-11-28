type Work={rank:()=>number;run:()=>Promise<void>};

export function mediaQueue(delay=0){
 const pending:Work[]=[];
 let running=false;
 let scheduled=false;
 const schedule=()=>{
   if(running||scheduled)return;
   scheduled=true;
   window.setTimeout(()=>{scheduled=false;next();},delay);
 };
 const next=()=>{
   if(running||!pending.length)return;
   let first=0;
   for(let index=1;index<pending.length;index++)if(pending[index].rank()>pending[first].rank())first=index;
   const [work]=pending.splice(first,1);
   running=true;
   void work.run().finally(()=>{running=false;queueMicrotask(next);});
 };
 return <T>(rank:()=>number,signal:AbortSignal,task:()=>Promise<T>)=>new Promise<T|null>((resolve,reject)=>{
   if(signal.aborted){resolve(null);return;}
   const cancel=()=>{
     const index=pending.indexOf(work);
     if(index>=0){pending.splice(index,1);resolve(null);}
   };
   const work={rank,run:async()=>{
     signal.removeEventListener('abort',cancel);
     try{resolve(await task());}catch(error){reject(error);}
   }};
   pending.push(work);
   signal.addEventListener('abort',cancel,{once:true});
   schedule();
 });
}

import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import type {PDFDocumentProxy,RenderTask} from 'pdfjs-dist';

type Section={title:string;text?:string;rows?:string[][]};
const chunkSize=2*1024*1024;
async function readDocument(url:string,signal:AbortSignal,limit:number){
 const read=async(start:number)=>fetch(url,{signal,headers:{Range:`bytes=${start}-${start+chunkSize-1}`}});
 const response=await read(0);
 if(!response.ok)throw Error();
 if(response.status===200){
   const length=Number(response.headers.get('content-length'));
   if(length>limit)throw Error();
   const data=new Uint8Array(await response.arrayBuffer());
   if(data.length>limit)throw Error();
   return data;
 }
 const info=/^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')??'');
 if(!info||Number(info[2])>limit)throw Error();
 const data=new Uint8Array(Number(info[2]));
 let part=response,offset=0;
 while(offset<data.length){
   const block=new Uint8Array(await part.arrayBuffer());
   if(!part.ok||!block.length||block.length>chunkSize||offset+block.length>data.length)throw Error();
   data.set(block,offset);offset+=block.length;
   if(offset<data.length){
     part=await read(offset);
     const range=/^bytes (\d+)-\d+\/(\d+)$/.exec(part.headers.get('content-range')??'');
     if(!range||Number(range[1])!==offset||Number(range[2])!==data.length)throw Error();
   }
 }
 return data;
}

async function readOffice(kind:string,data:Uint8Array):Promise<Section[]>{
 const {unzipSync,strFromU8}=await import('fflate');
 let size=0,count=0;
 const files=unzipSync(data,{filter:entry=>{
   const use=kind==='docx'?entry.name==='word/document.xml':kind==='pptx'
     ? /^ppt\/(?:slides\/slide\d+|presentation)\.xml$/.test(entry.name)||entry.name==='ppt/_rels/presentation.xml.rels'
     : /^xl\/(?:worksheets\/sheet\d+|sharedStrings|workbook)\.xml$/.test(entry.name)||entry.name==='xl/_rels/workbook.xml.rels';
   if(use){size+=entry.originalSize;if(size>12*1024*1024||++count>252)throw Error();}
   return use;
 }});
 const xml=(name:string)=>{
   const bytes=files[name];
   if(!bytes)return null;
   const source=strFromU8(bytes);
   if(/<!DOCTYPE|<!ENTITY/i.test(source))throw Error();
   const result=new DOMParser().parseFromString(source,'application/xml');
   if(result.querySelector('parsererror'))throw Error();
   return result;
 };
 const elements=(node:Document|Element|null,name:string)=>Array.from(node?.getElementsByTagNameNS('*',name)??[]);
 const text=(node:Element)=>elements(node,'t').map(value=>value.textContent??'').join('');
 if(kind==='docx')return [{title:'正文',text:elements(xml('word/document.xml'),'p').slice(0,160).map(text).join('\n').slice(0,24000)}];
 const slides=kind==='pptx',root=slides?'ppt':'xl',main=slides?'presentation':'workbook';
 const targetPattern=slides?/^slides\/slide\d+\.xml$/:/^worksheets\/sheet\d+\.xml$/;
 const targets=new Map(elements(xml(`${root}/_rels/${main}.xml.rels`),'Relationship').filter(rel=>rel.getAttribute('TargetMode')!=='External').map(rel=>[rel.getAttribute('Id'),(rel.getAttribute('Target')??'').replace(new RegExp(`^/${root}/`),'')]));
 const references=elements(xml(`${root}/${main}.xml`),slides?'sldId':'sheet');
 const shared=slides?[]:elements(xml('xl/sharedStrings.xml'),'si');
 return references.slice(0,250).map((node,index)=>{
   const id=Array.from(node.attributes).find(attr=>attr.localName==='id'&&!!attr.namespaceURI)?.value;
   const target=targets.get(id??null);
   const doc=target&&targetPattern.test(target)?xml(`${root}/${target}`):null;
   if(slides)return {title:`幻灯片 ${index+1}`,text:elements(doc,'p').slice(0,120).map(text).join('\n').slice(0,16000)};
   return {title:node.getAttribute('name')||`工作表 ${index+1}`,rows:elements(doc,'row').slice(0,24).map(row=>{
     const cells:string[]=[];
     for(const cell of elements(row,'c').slice(0,64)){
       const letters=/^[A-Z]+/.exec(cell.getAttribute('r')??'')?.[0];
       const column=letters?[...letters].reduce((value,letter)=>value*26+letter.charCodeAt(0)-64,0)-1:cells.length;
       if(column>=16)continue;
       const value=elements(cell,'v')[0]?.textContent??'';
       const sharedValue=shared[Number(value)];
       cells[column]=(cell.getAttribute('t')==='s'?(sharedValue?text(sharedValue):''):cell.getAttribute('t')==='inlineStr'?text(cell):value).slice(0,500);
     }
     return Array.from(cells,value=>value??'');
   })};
 });
}

export default function DocumentPreview({kind,url}:{kind:string;url:string}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[sections,setSections]=useState<Section[]|null>(null);
 const [index,setIndex]=useState(0),[failed,setFailed]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
   const controller=new AbortController();
   let dispose:(()=>void)|undefined;
   setPdf(null);setSections(null);setIndex(0);setFailed(false);
   void (async()=>{
     const data=await readDocument(url,controller.signal,(kind==='pdf'?64:24)*1024*1024);
     if(kind==='pdf'){
       const [api,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
       if(controller.signal.aborted)return;
       api.GlobalWorkerOptions.workerSrc=worker.default;
       const task=api.getDocument({data,useWasm:false,maxImageSize:16_000_000});
       dispose=()=>{void task.destroy().catch(()=>{});};
       const document=await task.promise;
       if(!controller.signal.aborted)setPdf(document);
     }else{
       const result=await readOffice(kind,data);
       if(!controller.signal.aborted)setSections(result);
     }
   })().catch(()=>{if(!controller.signal.aborted)setFailed(true);});
   return()=>{controller.abort();dispose?.();};
 },[kind,url]);
 useEffect(()=>{
   const target=canvas.current;
   if(!pdf||!target)return;
   let live=true,task:RenderTask|undefined;
   void pdf.getPage(index+1).then(page=>{
     if(!live)return;
     const original=page.getViewport({scale:1});
     const view=page.getViewport({scale:Math.min(2,1200/Math.max(original.width,original.height))});
     target.width=Math.ceil(view.width);target.height=Math.ceil(view.height);
     task=page.render({canvas:target,viewport:view});
     return task.promise;
   }).catch(()=>{if(live)setFailed(true);});
   return()=>{live=false;task?.cancel();};
 },[pdf,index]);
 if(failed)return <p role="alert">无法预览此文档。可从文件架双击用默认软件打开。</p>;
 if(!pdf&&!sections)return <p role="status">正在读取文档…</p>;
 const count=pdf?.numPages??sections?.length??0,section=sections?.[index];
 return <div className="document-preview">
   {count>1&&<nav aria-label="文档翻页"><Button size="sm" variant="ghost" disabled={index===0} onClick={()=>setIndex(index-1)}>上一页</Button><span aria-live="polite">{index+1} / {count}</span><Button size="sm" variant="ghost" disabled={index+1>=count} onClick={()=>setIndex(index+1)}>下一页</Button></nav>}
   {pdf?<canvas key={index} ref={canvas} aria-label={`PDF 第 ${index+1} 页`}/>:<><p className="muted">简化预览{section?` · ${section.title}`:''}</p>
   {section?.rows?.length?<div className="document-table" tabIndex={0} aria-label="表格片段"><table><tbody>{section.rows.map((row,rowIndex)=><tr key={rowIndex}>{row.map((cell,column)=><td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>:<pre tabIndex={0}>{section?.text?.trim()||'没有可显示的文本。'}</pre>}</>}
 </div>;
}

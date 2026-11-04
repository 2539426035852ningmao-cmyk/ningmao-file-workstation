import type {ManagedReference} from "./backend";

export type LocalTagSuggestion={tag:string;reason:string;ids:number[]};

const typeTags:Record<string,string>={
  png:"图片",jpg:"图片",jpeg:"图片",webp:"图片",gif:"图片",bmp:"图片",tif:"图片",tiff:"图片",avif:"图片",heic:"图片",svg:"图片",
  mp4:"视频",mov:"视频",mkv:"视频",avi:"视频",webm:"视频",m4v:"视频",mpg:"视频",mpeg:"视频",
  mp3:"音频",wav:"音频",flac:"音频",m4a:"音频",aac:"音频",ogg:"音频",opus:"音频",
  pdf:"文档",doc:"文档",docx:"文档",xls:"文档",xlsx:"文档",ppt:"文档",pptx:"文档",txt:"文档",md:"文档",rtf:"文档",odt:"文档",ods:"文档",odp:"文档",csv:"文档",
  zip:"压缩包","7z":"压缩包",rar:"压缩包",tar:"压缩包",gz:"压缩包",
};
const nameRules=[
  {tag:"截图",words:["截图","截屏","screenshot"]},
  {tag:"草稿",words:["草稿","draft"]},
  {tag:"参考",words:["参考","reference"]},
  {tag:"图标",words:["图标","icon"]},
] as const;

export function localTagSuggestions(items:ManagedReference[]):LocalTagSuggestion[]{
  const grouped=new Map<string,{ids:number[];reasons:Set<string>}>();
  const add=(item:ManagedReference,tag:string,reason:string)=>{
    if(item.tags.includes(tag))return;
    const value=grouped.get(tag)??{ids:[],reasons:new Set<string>()};
    value.ids.push(item.id);value.reasons.add(reason);grouped.set(tag,value);
  };
  for(const item of items){
    const kind=item.kind.replace(/^\./,"").toLocaleLowerCase();
    const typeTag=typeTags[kind];if(typeTag)add(item,typeTag,`文件类型为 ${kind.toLocaleUpperCase()}`);
    const name=item.name.toLocaleLowerCase();
    for(const rule of nameRules){const word=rule.words.find(value=>name.includes(value));if(word)add(item,rule.tag,`文件名含“${word}”`);}
  }
  return [...grouped].map(([tag,value])=>({tag,ids:value.ids,reason:[...value.reasons].join("、")}));
}

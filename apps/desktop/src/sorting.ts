import type { Item } from "./backend";
export const sortOptions=[{value:"manual",label:"手动顺序"},{value:"name",label:"名称排序"},{value:"modified",label:"最近修改"},{value:"type",label:"类型排序"},{value:"size",label:"大小从大到小"}] as const;
export type SortMode=typeof sortOptions[number]["value"];
export const isSortMode=(value:unknown):value is SortMode=>sortOptions.some(option=>option.value===value);
const collator=new Intl.Collator("zh-CN",{numeric:true,sensitivity:"base"});
const byName=(a:Item,b:Item)=>collator.compare(a.name,b.name) || a.id-b.id;
function numberValue(item:Item,key:"modified"|"bytes"):number|undefined {
  const value=item[key];
  return item.status==="normal" && Number.isSafeInteger(value) && value>=(key==="modified"?1:0)?value:undefined;
}
export function sortItems(items:Item[],mode:SortMode):Item[] {
  if(mode==="manual")return items;
  return [...items].sort((a,b)=>{
    if(a.kind==="folder" || b.kind==="folder")return Number(b.kind==="folder")-Number(a.kind==="folder") || byName(a,b);
    if(mode==="name")return byName(a,b);
    if(mode==="type") {
      const available=Number(b.status==="normal")-Number(a.status==="normal");
      return available || (a.status==="normal"?collator.compare(a.kind,b.kind):0) || byName(a,b);
    }
    const key=mode==="modified"?"modified":"bytes",av=numberValue(a,key),bv=numberValue(b,key);
    return (av===undefined?bv===undefined?0:1:bv===undefined?-1:bv-av) || byName(a,b);
  });
}

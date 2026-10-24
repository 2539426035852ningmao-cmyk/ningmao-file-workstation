import type { Item } from "./backend";
export type ShelfFilters={kind:string;tag:string;status:""|"normal"|"issues"};
export const defaultFilters:Readonly<ShelfFilters>={kind:"",tag:"",status:""};
export function filterItems(items:Item[],query:string,filters:ShelfFilters):Item[] {
  const name=query.toLocaleLowerCase();
  return items.filter(item=>item.name.toLocaleLowerCase().includes(name) &&
    (!filters.kind || item.kind===filters.kind) && (!filters.tag || item.tags.includes(filters.tag)) &&
    (!filters.status || (filters.status==="normal"?item.status==="normal":item.status!=="normal")));
}

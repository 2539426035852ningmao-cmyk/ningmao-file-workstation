import type {Theme} from "../preferences";
export const appearances={"warm-white":{name:"白色",theme:"light"},"navy-black":{name:"深蓝色",theme:"dark"},"brand-blue":{name:"亮蓝色",theme:"blue"}} as const;
export type OrbAppearance=keyof typeof appearances;
export function themeAppearance(theme:Theme):OrbAppearance {return theme==="light"?"warm-white":theme==="blue"?"brand-blue":"navy-black";}

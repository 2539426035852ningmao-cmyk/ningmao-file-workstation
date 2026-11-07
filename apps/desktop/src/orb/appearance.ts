import type {Theme} from "../preferences";
type OrbAppearance="warm-white"|"navy-black"|"brand-blue";
export function themeAppearance(theme:Theme):OrbAppearance {return theme==="light"?"warm-white":theme==="blue"?"brand-blue":"navy-black";}

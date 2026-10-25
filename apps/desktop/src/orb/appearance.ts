export const appearances={"warm-white":{name:"暖白",fill:"#F5F3EF",eye:"#191B20"},"navy-black":{name:"深蓝黑",fill:"#191E28",eye:"#F5F6F8"},"brand-blue":{name:"主题蓝",fill:"#2869D6",eye:"#F8FAFF"}} as const;
export type OrbAppearance=keyof typeof appearances;
export const appearanceKey="ningmao-orb-appearance-v1";
export function readAppearance():OrbAppearance {try{const value=localStorage.getItem(appearanceKey);return value && Object.prototype.hasOwnProperty.call(appearances,value)?value as OrbAppearance:"warm-white";}catch{return "warm-white";}}
export function writeAppearance(value:OrbAppearance):string {try{localStorage.setItem(appearanceKey,value);return "";}catch{return "外观暂未保存，本次仍可使用。";}}

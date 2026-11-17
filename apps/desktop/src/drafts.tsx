import {createContext,useContext,useState,type Dispatch,type SetStateAction} from 'react';
export const DraftScope=createContext('main');
const prefix='ningmao-draft-v1:';
function matches(value:unknown,fallback:unknown):boolean{if(fallback===null)return value===null;if(Array.isArray(fallback))return Array.isArray(value);if(typeof fallback==='object')return typeof value==='object'&&value!==null&&Object.entries(fallback).every(([key,v])=>matches((value as Record<string,unknown>)[key],v));return typeof value===typeof fallback&&(typeof value!=='number'||Number.isFinite(value));}
export function readDraft<T>(key:string,fallback:T):T{try{const raw=localStorage.getItem(prefix+key);if(!raw||raw.length>131072)return fallback;const value:unknown=JSON.parse(raw);return matches(value,fallback)?value as T:fallback;}catch{return fallback;}}
export function saveDraft(key:string,value:unknown):boolean{try{const raw=JSON.stringify(value);if(raw.length>131072)return false;localStorage.setItem(prefix+key,raw);return true;}catch{return false;}}
export function clearDraft(key:string){try{localStorage.removeItem(prefix+key);}catch{/* Retain the original draft when storage is unavailable. */}}
export function useDraftState<T>(name:string,initial:T):[T,Dispatch<SetStateAction<T>>,()=>void,string]{
 const scope=useContext(DraftScope),key=`${scope}:${name}`;
 const [stored,setStored]=useState(()=>({key,value:readDraft(key,initial)})),[warning,setWarning]=useState('');
 const value=stored.key===key?stored.value:readDraft(key,initial);
 const setValue:Dispatch<SetStateAction<T>>=next=>{const result=typeof next==='function'?(next as (previous:T)=>T)(value):next;setStored({key,value:result});setWarning(saveDraft(key,result)?'':'草稿暂时无法保存，请保留当前窗口。');};
 return [value,setValue,()=>{clearDraft(key);setStored({key,value:initial});},warning];
}

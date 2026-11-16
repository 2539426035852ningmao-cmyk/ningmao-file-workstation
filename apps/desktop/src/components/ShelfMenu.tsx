import {useState,type ReactNode} from "react";
import { DropdownMenu,Portal } from "radix-ui";

// Existing Radix owns focus, keyboard navigation and portal collision handling
export function ShelfMenu({label,trigger,children,align="end",onOpenChange,open,centered=false}:{label:string;trigger:ReactNode;children:ReactNode;align?:"start"|"end";onOpenChange?:(open:boolean)=>void;open?:boolean;centered?:boolean}) {
  const [localOpen,setLocalOpen]=useState(false);
  const visible=open??localOpen;
  return <DropdownMenu.Root modal={false} open={visible} onOpenChange={value=>{setLocalOpen(value);onOpenChange?.(value);}}><DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>{centered&&visible&&<Portal.Root><div className="shelf-menu-backdrop" aria-hidden="true"/></Portal.Root>}<DropdownMenu.Portal><DropdownMenu.Content className={`shelf-menu${centered?" shelf-menu-centered":""}`} aria-label={label} align={align} sideOffset={4} collisionPadding={8}>{children}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

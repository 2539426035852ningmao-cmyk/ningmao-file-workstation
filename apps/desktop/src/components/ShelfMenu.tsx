import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";

// Existing Radix owns focus, keyboard navigation and portal collision handling
export function ShelfMenu({label,trigger,children,align="end",onOpenChange,open}:{label:string;trigger:ReactNode;children:ReactNode;align?:"start"|"end";onOpenChange?:(open:boolean)=>void;open?:boolean}) {
  return <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}><DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="shelf-menu" aria-label={label} align={align} sideOffset={4} collisionPadding={8}>{children}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

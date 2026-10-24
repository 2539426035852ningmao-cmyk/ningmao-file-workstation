import type { ReactNode } from "react";
import { DropdownMenu } from "radix-ui";

// Existing Radix owns focus, keyboard navigation and portal collision handling
export function ShelfMenu({label,trigger,children,align="end"}:{label:string;trigger:ReactNode;children:ReactNode;align?:"start"|"end"}) {
  return <DropdownMenu.Root modal={false}><DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="shelf-menu" aria-label={label} align={align} sideOffset={4} collisionPadding={8}>{children}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

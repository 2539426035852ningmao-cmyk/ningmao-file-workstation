"use client"

import * as React from "react"
import { cn } from "cn"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import {invoke,isTauri} from "@tauri-apps/api/core"

const Protection=React.createContext(false)
let protectedForms=0, guardQueue=Promise.resolve()
function guard(delta:number){protectedForms+=delta;const active=protectedForms>0;if(isTauri())guardQueue=guardQueue.catch(()=>{}).then(()=>invoke<void>('form_guard',{active})).catch(error=>console.error('Form guard:',error))}
function Sheet({ protect=false,...props }: React.ComponentProps<typeof SheetPrimitive.Root>&{protect?:boolean}) {
  React.useEffect(()=>{if(!protect||!props.open)return;guard(1);return()=>guard(-1)},[protect,props.open])
  return <Protection.Provider value={protect}><SheetPrimitive.Root data-slot="sheet" {...props} /></Protection.Provider>
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  const protectedForm=React.useContext(Protection)
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn("centered-panel",className)}
        {...props}
        onPointerDownOutside={event=>{props.onPointerDownOutside?.(event);if(protectedForm)event.preventDefault()}}
        onInteractOutside={event=>{props.onInteractOutside?.(event);if(protectedForm)event.preventDefault()}}
        onEscapeKeyDown={event=>{props.onEscapeKeyDown?.(event);if(protectedForm){event.preventDefault();event.stopPropagation()}}}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

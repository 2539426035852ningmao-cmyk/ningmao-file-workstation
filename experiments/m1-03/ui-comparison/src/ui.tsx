import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { Button as SpaceButton } from "./components/spaceui/Button";
import { Input as SpaceInput } from "./components/spaceui/Input";
import * as SpaceTabs from "./components/spaceui/Tabs";
import { ContextMenu as SpaceMenu } from "./components/spaceui/ContextMenu";
import { Badge as SpaceBadge } from "./components/spaceui/Badge";
import { Button as ShadButton } from "./components/shadcn/button";
import { Input as ShadInput } from "./components/shadcn/input";
import * as ShadTabs from "./components/shadcn/tabs";
import * as ShadMenu from "./components/shadcn/context-menu";
import * as ShadSheet from "./components/shadcn/sheet";
import { Badge as ShadBadge } from "./components/shadcn/badge";

export type Variant = "spaceui" | "shadcn";
export function Button({ system, primary, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { system: Variant; primary?: boolean }) {
  return system === "spaceui" ? <SpaceButton variant={primary ? "accent" : "default"} size="sm" {...props}>{children}</SpaceButton> : <ShadButton variant={primary ? "default" : "outline"} size="sm" {...props}>{children}</ShadButton>;
}
export function Search({ system, ...props }: InputHTMLAttributes<HTMLInputElement> & { system: Variant }) {
  return system === "spaceui" ? <SpaceInput {...props} size="md" /> : <ShadInput {...props} />;
}
export function Badge({ system, children }: { system: Variant; children: ReactNode }) {
  return system === "spaceui" ? <SpaceBadge variant="accent">{children}</SpaceBadge> : <ShadBadge variant="secondary">{children}</ShadBadge>;
}
export function ShelfTabs({ system, value, onChange }: { system: Variant; value: string; onChange: (value: string) => void }) {
  const Root = system === "spaceui" ? SpaceTabs.Root : ShadTabs.Tabs;
  const List = system === "spaceui" ? SpaceTabs.List : ShadTabs.TabsList;
  const Trigger = system === "spaceui" ? SpaceTabs.Trigger : ShadTabs.TabsTrigger;
  return <Root value={value} onValueChange={onChange} className="shelf-tabs"><List aria-label="文件架"><Trigger value="all">灵感收集</Trigger><Trigger value="设计参考">设计参考</Trigger><Trigger value="项目交付">项目交付</Trigger></List></Root>;
}
export function Menu({ system, children, inspect, tag, remove }: { system: Variant; children: ReactNode; inspect: () => void; tag: () => void; remove: () => void }) {
  return system === "spaceui" ? <SpaceMenu.Root trigger={children}><SpaceMenu.Item label="查看详情" onSelect={inspect} /><SpaceMenu.Item label="切换精选标签" onSelect={tag} /><SpaceMenu.Separator /><SpaceMenu.Item label="移除样本引用" onSelect={remove} /></SpaceMenu.Root> : <ShadMenu.ContextMenu><ShadMenu.ContextMenuTrigger asChild>{children}</ShadMenu.ContextMenuTrigger><ShadMenu.ContextMenuContent><ShadMenu.ContextMenuItem onSelect={inspect}>查看详情</ShadMenu.ContextMenuItem><ShadMenu.ContextMenuItem onSelect={tag}>切换精选标签</ShadMenu.ContextMenuItem><ShadMenu.ContextMenuSeparator /><ShadMenu.ContextMenuItem onSelect={remove}>移除样本引用</ShadMenu.ContextMenuItem></ShadMenu.ContextMenuContent></ShadMenu.ContextMenu>;
}
export function Drawer({ system, open, onClose, children, title }: { system: Variant; open: boolean; onClose: () => void; children: ReactNode; title: string }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) returnFocus.current = document.activeElement as HTMLElement;
    return () => { if (open && returnFocus.current?.isConnected) returnFocus.current.focus(); };
  }, [open]);
  if (system === "shadcn") return <ShadSheet.Sheet open={open} onOpenChange={value => !value && onClose()}><ShadSheet.SheetContent className="details-sheet"><ShadSheet.SheetHeader><ShadSheet.SheetTitle>{title}</ShadSheet.SheetTitle><ShadSheet.SheetDescription>合成素材详情，不访问磁盘原文件</ShadSheet.SheetDescription></ShadSheet.SheetHeader>{children}</ShadSheet.SheetContent></ShadSheet.Sheet>;
  // SpaceUI's Dialog includes app-specific form/manager dependencies. Compose
  // the same mature Radix focus/portal primitive with SpaceUI tokens instead.
  return <Dialog.Root open={open} onOpenChange={value => !value && onClose()}><Dialog.Portal><Dialog.Overlay className="drawer-backdrop" /><Dialog.Content className="space-drawer details-sheet"><header><Dialog.Title>{title}</Dialog.Title><Dialog.Description>合成素材详情，不访问磁盘原文件</Dialog.Description><Dialog.Close aria-label="关闭详情"><X size={18} /></Dialog.Close></header>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}

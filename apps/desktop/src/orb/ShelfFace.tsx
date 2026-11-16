import {ContextMenu} from "radix-ui";
import {Check} from "lucide-react";
import {OrbFace} from "./OrbFace";
import {themes,type Theme} from "../preferences";

export function ShelfFace({disabled,onCollapse,theme,onTheme}:{disabled:boolean;onCollapse:()=>void;theme:Theme;onTheme:(theme:Theme)=>void}){
  return <ContextMenu.Root><ContextMenu.Trigger asChild>
    <button className="shelf-face-control" aria-label="表情 收起文件架" aria-description="单击收回小球 右键选择主题" disabled={disabled} onClick={onCollapse} data-no-window-drag><OrbFace brand/></button>
  </ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content className="theme-palette" aria-label="选择主题" collisionPadding={8}>
    <ContextMenu.RadioGroup value={theme} onValueChange={value=>onTheme(value as Theme)}>
      {Object.entries(themes).map(([value,label])=><ContextMenu.RadioItem className="theme-palette-choice" key={value} value={value} aria-label={label+"主题"}><span className="theme-swatch" data-theme={value}/><span>{label}</span><ContextMenu.ItemIndicator><Check size={14}/></ContextMenu.ItemIndicator></ContextMenu.RadioItem>)}
    </ContextMenu.RadioGroup>
  </ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>;
}

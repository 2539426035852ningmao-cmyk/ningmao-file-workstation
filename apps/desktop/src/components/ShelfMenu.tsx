import {Children,Fragment,isValidElement,useState,type ReactNode,type ReactElement} from "react";
import { DropdownMenu,Portal } from "radix-ui";

// Existing Radix owns focus, keyboard navigation and portal collision handling
export function ShelfMenu({label,trigger,children,settings,account,align="end",onOpenChange,open,centered=false}:{label:string;trigger:ReactNode;children:ReactNode;settings?:ReactNode;account?:()=>void;align?:"start"|"end";onOpenChange?:(open:boolean)=>void;open?:boolean;centered?:boolean}) {
  const [localOpen,setLocalOpen]=useState(false);
  const visible=open??localOpen;
  return <DropdownMenu.Root modal={false} open={visible} onOpenChange={value=>{setLocalOpen(value);onOpenChange?.(value);}}><DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>{centered&&visible&&<Portal.Root><div className="shelf-menu-backdrop" aria-hidden="true"/></Portal.Root>}<DropdownMenu.Portal><DropdownMenu.Content className={`shelf-menu${centered?" shelf-menu-centered":""}`} aria-label={label} align={align} sideOffset={4} collisionPadding={8}>{centered?<ScenePanel settings={settings} account={account}>{children}</ScenePanel>:children}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>;
}

function flatten(children:ReactNode):ReactElement<Record<string,unknown>>[]{
  return Children.toArray(children).flatMap(child=>!isValidElement<Record<string,unknown>>(child)?[]:child.type===Fragment?flatten(child.props.children as ReactNode):[child]);
}
function ScenePanel({children,settings,account}:{children:ReactNode;settings?:ReactNode;account?:()=>void}){
  const [scene,setScene]=useState("常用操作");
  const elements=flatten(children),groups=elements.filter(child=>child.type===DropdownMenu.Group);
  const scenes=["常用操作","显示与整理","工具与记录","窗口与入口"];
  const labels:Record<string,string>={"收集与搜索":"常用操作","选中文件":"常用操作","浏览与整理":"显示与整理","工具与记录":"工具与记录","窗口":"窗口与入口"};
  const nav=(name:string)=><DropdownMenu.Item key={name} className="scene-nav" aria-current={scene===name?"page":undefined} onSelect={event=>{event.preventDefault();setScene(name);}}>{name}</DropdownMenu.Item>;
  return <div className="scene-panel"><div className="scene-heading">更多操作</div><aside className="scene-sidebar"><div className="scene-navigation"><div className="scene-label">工作</div>{scenes.map(nav)}</div><div className="scene-footer">{nav("设置")}{nav("帮助")}<DropdownMenu.Item disabled={!account} className={account?"scene-nav":"scene-reserved"} onSelect={account}>账户{!account&&<span>预留</span>}</DropdownMenu.Item><DropdownMenu.Item disabled className="scene-reserved scene-upgrade">升级<span>预留</span></DropdownMenu.Item></div></aside><section className="scene-content" aria-label={scene}>
    <DropdownMenu.Label className="scene-title">{scene}</DropdownMenu.Label>
    {scene==="设置"?settings:scene==="帮助"?<div className="scene-help"><dl><dt>搜索当前架</dt><dd>Ctrl F</dd><dt>跨架搜索</dt><dd>Ctrl K</dd><dt>粘贴文件</dt><dd>Ctrl V</dd><dt>预览选中项</dt><dd>Space</dd><dt>关闭面板</dt><dd>Escape</dd></dl><span>柠猫文件工作站 0.1</span></div>:groups.filter(group=>labels[String(group.props["aria-label"])]===scene).map((group,index)=><Fragment key={index}>{group}</Fragment>)}
    {scene==="窗口与入口"&&elements.filter(child=>child.type===DropdownMenu.Item)}
  </section></div>;
}

import {useEffect,useRef} from "react";
import {OrbMotionController} from "./OrbMotionController";

export function OrbFace({active=false,brand=false,locked=false}:{active?:boolean;brand?:boolean;locked?:boolean}) {
  const svg=useRef<SVGSVGElement>(null);
  useEffect(()=>{const node=svg.current,host=node?.closest<HTMLElement>("[data-orb-host],.quick-peek,.workstation");if(!node || !host || (!active && !brand) || locked)return;const motion=new OrbMotionController(node,host,brand ? 0.25 : host.dataset.orbMode==="capsule" ? 0.35 : 1);return()=>motion.destroy();},[active,brand,locked]);
  return <svg ref={svg} className={`orb-face${brand?" brand-eyes":""}`} viewBox={brand?"12 5 30 32":"0 0 48 48"} aria-hidden="true" focusable="false">
    <g className="orb-eyes">
      <g className="orb-eye-left"><path d="M21.5 11.3 C25.2 10.3 27 14.1 28.2 18.4 C29.6 23.1 29.2 27.3 26.1 28 C22.8 28.7 20.8 24.8 19.7 20.2 C18.5 15.7 18.5 12.1 21.5 11.3Z"/></g>
      <g className="orb-eye-right"><path d="M33.6 9.4 C36.3 8.7 37.8 11.4 38.8 15 C39.8 18.7 39.5 21.6 37.2 22.2 C34.7 22.8 33.1 19.8 32.2 16.2 C31.3 12.7 31.4 10 33.6 9.4Z"/></g>
    </g>
  </svg>;
}

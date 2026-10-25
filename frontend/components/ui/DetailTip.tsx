"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

function placement(r:DOMRect) {
  const viewport=document.documentElement.clientWidth,width=Math.min(352,viewport-24),above=window.innerHeight-r.bottom<300&&r.top>300;
  return {left:Math.max(12,Math.min(viewport-width-12,r.left+r.width/2-width/2)),top:above?window.innerHeight-r.top+8:r.bottom+8,above};
}

/** Hover/focus detail with a persistent tap state; the portalled surface stays inside the viewport. */
export default function DetailTip({label,children,content,className,style,interactive=false}:{label:string;children:ReactNode;content:ReactNode;className?:string;style?:CSSProperties;interactive?:boolean}) {
  const id=useId(),trigger=useRef<HTMLButtonElement>(null),surface=useRef<HTMLDivElement>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [point,setPoint]=useState<{left:number;top:number;above:boolean}|null>(null),[pinned,setPinned]=useState(false);
  const stop=()=>{if(timer.current)clearTimeout(timer.current);};
  const close=()=>{stop();setPoint(null);setPinned(false);};
  const show=()=>{
    stop();const r=trigger.current?.getBoundingClientRect();if(!r)return;
    setPoint(placement(r));
  };
  const leave=()=>{if(!pinned)timer.current=setTimeout(close,140);};
  useEffect(()=>{
    if(!point)return;
    const dismiss=()=>{setPoint(null);setPinned(false);};
    const outside=(e:PointerEvent)=>{if(!trigger.current?.contains(e.target as Node)&&!surface.current?.contains(e.target as Node))dismiss();};
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.preventDefault();if(interactive&&pinned)trigger.current?.focus();dismiss();}};
    const shift=()=>dismiss();
    const scroll=(e:Event)=>{if(surface.current?.contains(e.target as Node))return;const r=trigger.current?.getBoundingClientRect();if(!r||r.bottom<72||r.top>window.innerHeight)dismiss();else setPoint(placement(r));};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape);window.addEventListener("resize",shift);document.addEventListener("scroll",scroll,true);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape);window.removeEventListener("resize",shift);document.removeEventListener("scroll",scroll,true);};
  },[point,interactive,pinned]);
  useEffect(()=>{if(interactive&&pinned)surface.current?.querySelector<HTMLElement>("select,button")?.focus();},[interactive,pinned]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  return <><button ref={trigger} type="button" className={className} style={style} aria-label={label} aria-describedby={!interactive&&point?id:undefined} aria-haspopup={interactive?"dialog":undefined} aria-expanded={interactive?Boolean(point):undefined}
    onPointerEnter={e=>{if(e.pointerType!=="touch")show();}} onPointerLeave={leave} onFocus={show} onBlur={e=>{if(!surface.current?.contains(e.relatedTarget))close();}}
    onClick={()=>{if(pinned)close();else{show();setPinned(true);}}}>{children}</button>
    {point&&createPortal(<div ref={surface} id={id} role={interactive?"dialog":"tooltip"} aria-label={label} className="detail-tip" style={{left:point.left,...(point.above?{bottom:point.top}:{top:point.top}),maxHeight:`calc(100dvh - ${point.top+12}px)`}} onPointerEnter={stop} onPointerLeave={leave} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget)&&!trigger.current?.contains(e.relatedTarget))close();}}>
      {content}{interactive?<button className="detail-tip-close" type="button" onClick={()=>{trigger.current?.focus();close();}} aria-label="Close prize details">×</button>:null}
    </div>,document.body)}
  </>;
}

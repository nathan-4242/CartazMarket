import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { defaultAppearance, elementNames, type Draft, type Element } from "./draft";

export type Editing = {
  selected?: Element;
  onSelect?: (element: Element) => void;
  onMove?: (element: Element, x: number, y: number) => void;
  onResize?: (element: Element, scale: number) => void;
};

export function Editable({ name, draft, editing, children }: {
  name: Element; draft: Draft; editing: Editing; children: ReactNode;
}) {
  const appearance = draft.appearance[name] ?? defaultAppearance;
  const content = useRef<SVGGElement>(null);
  const [bounds, setBounds] = useState({x:0,y:0,width:0,height:0});
  const [preview, setPreview] = useState<{x:number;y:number;scale:number} | null>(null);
  const pending = useRef<{x:number;y:number;scale:number} | null>(null);
  const drag = useRef<{x:number;y:number;startX:number;startY:number;scale:number;resize:boolean} | null>(null);
  const current = preview ?? appearance;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const selected = editing.selected === name && !!editing.onMove;

  useLayoutEffect(() => {
    let active = true;
    function measure() {
      if (!active || !content.current) return;
      const box = content.current.getBBox();
      setBounds({x:box.x,y:box.y,width:box.width,height:box.height});
    }
    measure();
    void document.fonts.ready.then(measure);
    return () => { active = false; };
  }, [children]);

  function point(event: React.PointerEvent<SVGGElement>) {
    return new DOMPoint(event.clientX,event.clientY).matrixTransform((event.currentTarget.parentNode as SVGGElement).getScreenCTM()!.inverse());
  }

  const landscape = draft.print.orientation === "landscape";
  const layouts: Record<string,string> = {
    title:"translate(118.5 -9.6) scale(.85)",
    product:"translate(-2.5 26.25) scale(.75)",
    description:"translate(-2.5 33) scale(.75)",
    quantity:"translate(-2.5 33) scale(.75)",
    price:"translate(266.5 -104) scale(.85)",
    unit:"translate(266.5 -104) scale(.85)",
    period:"translate(148.5 -13) scale(.7071)",
    barcode:"translate(148.5 -13) scale(.7071)",
  };
  return <g transform={landscape ? layouts[name] ?? "translate(148.5 0) scale(.7071)" : undefined}><g transform={"translate("+current.x+" "+current.y+") translate("+centerX+" "+centerY+") scale("+(current.scale/100)+") translate("+(-centerX)+" "+(-centerY)+")"}
    className={editing.onMove ? "editable-element" : undefined}
    data-element={name} tabIndex={editing.onMove ? 0 : undefined}
    role={editing.onMove ? "button" : undefined}
    aria-label={editing.onMove ? (elementNames[name] ?? (name.startsWith("image:") ? "Imagem" : "Texto adicional")) + " — arraste para mover" : undefined}
    onFocus={(event) => { event.stopPropagation(); editing.onSelect?.(name); }}
    onPointerDown={(event) => {
      if (!editing.onMove || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus({preventScroll:true});
      editing.onSelect?.(name);
      pending.current=null;
      const position=point(event);
      drag.current={x:position.x,y:position.y,startX:appearance.x,startY:appearance.y,scale:appearance.scale,resize:(event.target as SVGElement).dataset.resize === "true"};
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (!drag.current) return;
      const position=point(event);
      const start=drag.current;
      const deltaX=position.x-start.x;
      const deltaY=position.y-start.y;
      const next = start.resize
        ? {x:start.startX,y:start.startY,scale:Math.max(30,Math.min(200,start.scale+200*(deltaX*bounds.width+deltaY*bounds.height)/Math.max(bounds.width*bounds.width+bounds.height*bounds.height,1)))}
        : {x:Math.round(start.startX+deltaX),y:Math.round(start.startY+deltaY),scale:start.scale};
      pending.current=next;
      setPreview(next);
    }}
    onPointerUp={(event) => {
      event.stopPropagation();
      const latest=pending.current;
      if (drag.current && latest) {
        if (drag.current.resize) editing.onResize?.(name, Math.round(latest.scale));
        else editing.onMove?.(name,latest.x,latest.y);
      }
      drag.current=null;
      pending.current=null;
      setPreview(null);
    }}
    onPointerCancel={() => {drag.current=null;pending.current=null;setPreview(null);}}
    onKeyDown={(event) => {
      const directions: Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      const delta=directions[event.key];
      if (!delta || !editing.onMove) return;
      event.preventDefault();
      event.stopPropagation();
      editing.onMove(name,appearance.x+delta[0]!*(event.shiftKey?10:1),appearance.y+delta[1]!*(event.shiftKey?10:1));
    }}>
    {editing.onMove && <rect x={bounds.x-2} y={bounds.y-2} width={bounds.width+4} height={bounds.height+4} fill="transparent" />}
    <g ref={content}>{children}</g>
    {selected && <>
      <rect x={bounds.x-4} y={bounds.y-4} width={bounds.width+8} height={bounds.height+8} fill="none" stroke="#2477cc" vectorEffect="non-scaling-stroke" strokeWidth="1.5" strokeDasharray="5 4" pointerEvents="none"/>
      <rect data-resize="true" x={bounds.x+bounds.width-5} y={bounds.y+bounds.height-5} width="12" height="12" fill="#2477cc" stroke="white" style={{cursor:"nwse-resize"}} />
    </>}
  </g></g>;
}

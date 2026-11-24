import { isA5Double, isA6Quad, pageDimensions } from "./paper";
import { Poster } from "./Poster";
import type { Draft } from "./draft";
import type { Editing } from "./Editable";

export function PaperPreview({draft,...editing}: {draft:Draft} & Editing) {
  const {width,height} = pageDimensions(draft.print);
  const rows = isA6Quad(draft.print) ? 2 : 1;
  const columns = rows === 2 || isA5Double(draft.print) ? 2 : 1;
  const multiple = columns === 2;
  const margin = multiple ? 0 : draft.print.margin;
  const panelWidth = (width - margin * 2) / columns;
  const panelHeight = (height - margin * 2) / rows;
  const panelDraft: Draft = multiple ? {...draft, print:{...draft.print, orientation:"portrait"}} : draft;
  return <svg className="paper-preview" xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 "+width+" "+height}
    style={{aspectRatio:width+"/"+height}} role="img" aria-label={"Folha "+draft.print.paper}>
    <rect width={width} height={height} fill="white"/>
    {Array.from({length:rows * columns}, (_, index)=>
      <svg key={index} x={margin + (index % columns) * panelWidth} y={margin + Math.floor(index / columns) * panelHeight} width={panelWidth} height={panelHeight}
        preserveAspectRatio={multiple || draft.print.paper === "A3" || draft.print.paper === "A4" ? "none" : undefined}
        viewBox={panelDraft.print.orientation==="landscape"?"0 0 594 420":"0 0 420 594"}>
        <Poster draft={panelDraft} {...(index === 0 ? editing : {})}/>
      </svg>
    )}
    {multiple && <g fill="none" stroke={draft.print.preprinted ? "#222" : "#fff"} strokeWidth="0.35" strokeDasharray="2 1" pointerEvents="none" aria-hidden="true">
      <path d={`M ${width / 2} 0 V ${height}`}/>
      {rows === 2 && <path d={`M 0 ${height / 2} H ${width}`}/>}
    </g>}
  </svg>;
}

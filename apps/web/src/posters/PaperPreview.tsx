import { pageDimensions } from "./paper";
import { Poster } from "./Poster";
import type { Draft } from "./draft";
import type { Editing } from "./Editable";

export function PaperPreview({draft,...editing}: {draft:Draft} & Editing) {
  const {width,height} = pageDimensions(draft.print);
  const margin = draft.print.margin;
  return <svg className="paper-preview" xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 "+width+" "+height}
    style={{aspectRatio:width+"/"+height}} role="img" aria-label={"Folha "+draft.print.paper}>
    <rect width={width} height={height} fill="white"/>
    <svg x={margin} y={margin} width={width-margin*2} height={height-margin*2} viewBox={draft.print.orientation==="landscape"?"0 0 594 420":"0 0 420 594"}>
      <Poster draft={draft} {...editing}/>
    </svg>
  </svg>;
}

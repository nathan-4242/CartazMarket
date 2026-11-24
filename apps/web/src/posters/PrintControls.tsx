import { useState } from "react";
import { Download, FileDown, Printer } from "lucide-react";
import type { Draft } from "./draft";
import { isA5Double, isA6Quad, papers, type PrintSettings } from "./paper";

export function PrintControls({draft,change}: {draft:Draft;change:(settings:PrintSettings)=>void}) {
  const double = isA5Double(draft.print);
  const quad = isA6Quad(draft.print);
  const multiple = double || quad;
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  function update(patch:Partial<PrintSettings>) {
    const next = {...draft.print,...patch};
    if(next.paper !== "A5" || next.orientation !== "landscape") delete next.a5Double;
    if(next.paper !== "A6" || next.orientation !== "portrait") delete next.a6Quad;
    change(next);
  }
  async function run(kind:"png"|"pdf"|"print") {
    const target=kind==="print"?window.open("","_blank"):null;
    if(kind==="print" && !target){setMessage("Permita a abertura da janela de impressão no navegador.");return;}
    if(target){target.opener=null;target.document.body.textContent="Preparando impressão…";}
    setBusy(true);setMessage("Preparando cartaz…");
    try {
      const {exportPng,exportPdf,printPoster}=await import("./output");
      if(kind==="png")await exportPng(draft);
      if(kind==="pdf")await exportPdf([draft]);
      if(kind==="print" && target)await printPoster(draft,target);
      setMessage(kind==="print"?"Confira o resultado na impressora. Abrir o diálogo não confirma a impressão.":"Arquivo gerado.");
    }catch(error){target?.close();setMessage(error instanceof Error?error.message:"Não foi possível gerar o cartaz.");}
    finally{setBusy(false);}
  }
  return <div className="print-controls">
    <div className="print-options">
      <label htmlFor="paper-size">Papel<select aria-label="Papel" id="paper-size" value={draft.print.paper} onChange={(event)=>{
        const paper = event.target.value as PrintSettings["paper"];
        update(paper === "A5" ? {paper,orientation:"landscape",a5Double:true} : paper === "A6" ? {paper,orientation:"portrait",a6Quad:true} : (paper === "A3" || paper === "A4") ? {paper,orientation:"portrait",margin:0} : {paper});
      }}>{Object.keys(papers).map((paper)=><option key={paper}>{paper}</option>)}</select></label>
      <label htmlFor="paper-orientation">Orientação<select aria-label="Orientação" id="paper-orientation" value={draft.print.orientation} onChange={(event)=>update({orientation:event.target.value as PrintSettings["orientation"]})}><option value="portrait">Retrato</option><option value="landscape">Paisagem</option></select></label>
      {draft.print.paper === "A5" && <label className="print-checkbox"><input type="checkbox"
        checked={draft.print.a5Double === true} onChange={(event)=>update(event.target.checked
          ? {a5Double:true,orientation:"landscape"} : {a5Double:false})}/>Duas placas de 15 × 21 cm</label>}
      {draft.print.paper === "A6" && <label className="print-checkbox"><input type="checkbox"
        checked={quad} onChange={(event)=>update(event.target.checked
          ? {a6Quad:true,orientation:"portrait"} : {a6Quad:false})}/>Quatro placas de 10,5 × 15 cm</label>}
      <label htmlFor="paper-margin">Margem (mm)<input id="paper-margin" type="number" min="0" max="20" step="1" disabled={multiple} value={multiple ? 0 : draft.print.margin} onChange={(event)=>{if(Number.isFinite(event.target.valueAsNumber))update({margin:Math.min(20,Math.max(0,event.target.valueAsNumber))});}}/></label>
      <label className="print-checkbox"><input type="checkbox" checked={draft.print.preprinted} onChange={(event)=>update({preprinted:event.target.checked})}/>Papel pré-impresso</label>
    </div>
    <div className="export-actions">
      <button className="tool-button" type="button" disabled={busy} onClick={()=>void run("png")}><Download size={16}/>PNG · 300 dpi</button>
      <button className="tool-button" type="button" disabled={busy} onClick={()=>void run("pdf")}><FileDown size={16}/>Exportar PDF</button>
      <button className="button" type="button" disabled={busy} onClick={()=>void run("print")}><Printer size={16}/>Imprimir</button>
    </div>
    <p className="print-note">{quad && "Use papel de 21 × 30 cm e escala de 100%. "}{double && "Use papel de 30 × 21 cm e escala de 100%. "}{draft.print.preprinted?"Imprime produto, preço, unidade, validade e textos adicionais. Cabeçalho, fundos e imagens ficam no papel físico.":multiple?"Desative cabeçalhos e rodapés.":"Na impressão, use o tamanho de papel escolhido, escala de 100% e desative cabeçalhos e rodapés."}</p>
    {message&&<span className="output-message" role="status">{message}</span>}
  </div>;
}


import { validateLinkedOutput } from "../connection/RemoteLabel";
import { pngWithDpi } from "./png";
import type { Font } from "opentype.js";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { PaperPreview } from "./PaperPreview";
import { fontFiles } from "./fonts";
import { pageDimensions } from "./paper";
import type { Draft } from "./draft";
import { parsePrice } from "./price";

const svgNamespace = "http://www.w3.org/2000/svg";

function validate(draft: Draft) {
  if (!draft.product.trim()) throw new Error("Preencha o nome do produto antes de exportar.");
  if (!parsePrice(draft.price)) throw new Error("Informe um preço válido no formato 6,99.");
  if (draft.start && draft.end && draft.start > draft.end) throw new Error("Corrija o período da promoção.");
}

export async function createOutput(draft: Draft): Promise<SVGSVGElement> {
  validate(draft);
  if (draft.source) await validateLinkedOutput(draft.source);
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-10000px;top:0;width:840px;pointer-events:none";
  document.body.append(container);
  const root = createRoot(container);
  try {
    flushSync(() => root.render(<PaperPreview draft={draft}/>));
    await Promise.all(Object.keys(fontFiles).map((family) => document.fonts.load('900 40px "'+family+'"')));
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const svg = container.querySelector("svg")!;
    const { parse } = await import("opentype.js");
    const fonts = new Map<string,Font>();
    const texts = [...svg.querySelectorAll("text")];
    for (const text of texts) {
      const computed = getComputedStyle(text);
      const family = computed.fontFamily.split(",")[0]!.replace(/["']/g,"").trim();
      const url = fontFiles[family];
      if (!url) throw new Error("Fonte indisponível para exportação: "+family);
      if (!fonts.has(family)) {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Não foi possível carregar a fonte "+family+".");
        fonts.set(family,parse(await response.arrayBuffer()));
      }
      const font = fonts.get(family)!;
      const size = parseFloat(computed.fontSize);
      const group = document.createElementNS(svgNamespace,"g");
      group.setAttribute("fill",computed.fill);
      let characterIndex = 0;
      for (const character of text.textContent ?? "") {
        const glyph = font.charToGlyph(character);
        if (glyph.index === 0 && character.trim()) throw new Error("A fonte selecionada não contém o caractere “"+character+"”. Troque a fonte ou revise o texto.");
        const start = text.getStartPositionOfChar(characterIndex);
        const end = text.getEndPositionOfChar(characterIndex);
        const advance = (glyph.advanceWidth ?? font.unitsPerEm) * size / font.unitsPerEm;
        const horizontalScale = advance > 0 ? (end.x-start.x)/advance : 1;
        const path = document.createElementNS(svgNamespace,"path");
        path.setAttribute("d",glyph.getPath(0,0,size).toPathData(4));
        path.setAttribute("transform","translate("+start.x+" "+start.y+") scale("+horizontalScale+" 1)");
        group.append(path);
        characterIndex += character.length;
      }
      text.replaceWith(group);
    }
    const output = svg.cloneNode(true) as SVGSVGElement;
    const {width,height} = pageDimensions(draft.print);
    output.setAttribute("width",width+"mm");
    output.setAttribute("height",height+"mm");
    output.removeAttribute("class");
    output.removeAttribute("style");
    output.querySelectorAll("[tabindex]").forEach((element)=>element.removeAttribute("tabindex"));
    return output;
  } finally {
    root.unmount();
    container.remove();
  }
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href=url;anchor.download=name;
  document.body.append(anchor);
  anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}

function filename(draft: Draft) {
  return (draft.product.trim().replace(/[^\p{L}\p{N} -]/gu,"").slice(0,65)||"cartaz")+"-"+draft.print.paper;
}

export async function exportPng(draft: Draft) {
  const svg = await createOutput(draft);
  const {width,height} = pageDimensions(draft.print);
  const image = new Image();
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:"image/svg+xml;charset=utf-8"}));
  try {
    image.src=url;await image.decode();
    const canvas=document.createElement("canvas");
    canvas.width=Math.round(width/25.4*300);
    canvas.height=Math.round(height/25.4*300);
    const context=canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar o PNG.");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("Não foi possível gerar o PNG.")),"image/png"));
    download(await pngWithDpi(blob,300),filename(draft)+".png");
  } finally {URL.revokeObjectURL(url);}
}

export async function exportPdf(drafts: Draft[]) {
  if (!drafts.length) throw new Error("Selecione pelo menos um cartaz.");
  const [{jsPDF}] = await Promise.all([import("jspdf"),import("svg2pdf.js")]);
  let pdf: InstanceType<typeof jsPDF> | undefined;
  for (const draft of drafts) {
    const svg=await createOutput(draft);
    const {width,height}=pageDimensions(draft.print);
    if (!pdf) pdf=new jsPDF({unit:"mm",format:[width,height],orientation:draft.print.orientation,compress:true});
    else pdf.addPage([width,height],draft.print.orientation);
    await pdf.svg(svg,{x:0,y:0,width,height});
  }
  pdf!.save(drafts.length===1?filename(drafts[0]!)+".pdf":"cartazes.pdf");
}

export async function printPoster(draft: Draft, target: Window) {
  try {
    const svg=await createOutput(draft);
    if (target.closed) return;
    const {width,height}=pageDimensions(draft.print);
    target.document.title="Imprimir cartaz";
    const style=target.document.createElement("style");
    style.textContent="@page{size:"+width+"mm "+height+"mm;margin:0}html,body{margin:0;padding:0}svg{display:block;width:"+width+"mm;height:"+height+"mm}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}";
    target.document.head.append(style);
    target.document.body.replaceChildren(target.document.importNode(svg,true));
    await Promise.all([...target.document.images].map((image)=>image.decode()));
    await new Promise((resolve)=>setTimeout(resolve,150));
    target.focus();
    target.print();
  } catch(error) {
    target.close();
    throw error;
  }
}

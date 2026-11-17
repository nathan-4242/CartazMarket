import { posterFont } from "./fonts";
import { Editable, type Editing } from "./Editable";
import { useId, type ReactNode } from "react";
import { defaultAppearance, type Appearance, type Draft } from "./draft";
import { parsePrice, priceLayout } from "./price";
import { getTemplate, type Template } from "./templates";

const width = 420;
const height = 594;
const left = 42;
const right = width - left;

function position(alignment: Appearance["alignment"]) {
  if (alignment === "left") return { x: left, anchor: "start" } as const;
  if (alignment === "right") return { x: right, anchor: "end" } as const;
  return { x: width / 2, anchor: "middle" } as const;
}

function splitLines(input: string): string[] {
  if (input.includes("\n")) return input.split("\n").flatMap((line) => line ? splitLines(line) : [""]);
  const words = input.trim().split(/\s+/).flatMap((word) => word.match(/.{1,23}/gu) ?? []);
  if (input.length <= 9 || words.length < 2) return [input];

  const total = words.join(" ").length;
  const lines: string[] = [];
  let row = "";
  const desired = Math.ceil(total / Math.min(3, Math.ceil(total / 23)));
  for (const word of words) {
    if (row && row.length + word.length + 1 > desired + 4 && lines.length < 2) {
      lines.push(row);
      row = "";
    }
    row += row ? " " + word : word;
  }
  return [...lines, row];
}

function FittedText({ children, y, size, appearance, fallback, maxSize = Infinity }: {
  children: string;
  y: number;
  size: number;
  maxSize?: number;
  appearance: Appearance;
  fallback: string;
}) {
  const { x, anchor } = position(appearance.alignment);
  const glyphWidth = [...children].reduce((total, letter) => {
    if (/[MW]/u.test(letter)) return total + 0.7;
    if (/[I .,:!]/u.test(letter)) return total + 0.36;
    return total + 0.46;
  }, 0);
  const fontSize = Math.min(maxSize, size, 318 / Math.max(1, glyphWidth));
  return (
    <text x={x + (anchor === "start" ? 5 : anchor === "end" ? -5 : 0)} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={posterFont(appearance.font)}
      fontSize={fontSize} fontWeight={900} textLength={glyphWidth * fontSize}
      lengthAdjust="spacingAndGlyphs" fill={appearance.color || fallback}>
      {children}
    </text>
  );
}

function Decoration({ model, gradientId }: { model: Template; gradientId: string }) {
 if(model.id === "oferta") return <path d="M9 147Q210 107 411 147V576Q411 585 399 585H21Q9 585 9 573Z" fill="#ffe500" />;
 if(model.id === "dia") return <><path d="M0 196Q210 147 420 196V594H0Z" fill="#ffe500"/><path d="M25 74L53 96M18 113L58 115M31 153L57 135M395 74L367 96M402 113L362 115M389 153L363 135" stroke="#ffe500" strokeWidth="4"/></>;
 if(model.id === "atacado") return <><path d="M0 184Q210 146 420 184V594H0Z" fill={"url(#" + gradientId + ")"}/><path d="M65 145Q205 114 351 143M88 153Q220 134 339 149" stroke="#ffe500" strokeWidth="3" fill="none"/></>;
 return <><path d="M0 190Q210 100 420 190V594H0Z" fill="#ffe500"/><path d="M0 208Q210 130 420 208V594H0Z" fill="#fafafa"/></>;
}

function PriceBlock({ draft, model, unitOnly = false }: { draft: Draft; model: Template; unitOnly?: boolean }) {
  const parts = parsePrice(draft.price) ?? { symbol: "R$", whole: "—", cents: "—" };
  const appearance = (draft.appearance.price ?? defaultAppearance);
  const layout = priceLayout(parts.whole, draft.unit, 1);
  const { size, wholeWidth, sideWidth, unitSize } = layout;
  const { x, anchor } = position(appearance.alignment);
  const blockWidth = wholeWidth + sideWidth;
  const origin = anchor === "start" ? x : anchor === "end" ? x - blockWidth : x - blockWidth / 2;
  const side = wholeWidth + 4;

  const unitStyle = draft.appearance.unit ?? defaultAppearance;
  return (
    <g transform={`translate(${origin} 0)`} fill={appearance.color || model.price}
      fontFamily={posterFont(appearance.font)} fontWeight={900}>
      {!unitOnly && <><text x={0} y="523" fontSize={size * 1.75} textLength={wholeWidth * 0.98} lengthAdjust="spacingAndGlyphs">{parts.whole}</text>
      <text x={side} y={455} fontSize={size * 0.98} textLength={sideWidth * 0.93} lengthAdjust="spacingAndGlyphs">,{parts.cents}</text></>}
      {unitOnly && <text x={side + (unitStyle.alignment === "left" ? 0 : unitStyle.alignment === "right" ? sideWidth : sideWidth / 2)} y={455 + size * 0.12 + unitSize * 1.3} textAnchor={position(unitStyle.alignment).anchor} fill={unitStyle.color || "#080808"} fontFamily={posterFont(unitStyle.font)} fontSize={unitSize * 1.3}>{draft.unit}</text>}
    </g>
  );
}

function dateLabel(value: string) {
  return value.split("-").reverse().join("/");
}

export function Poster({ draft, ...editing }: { draft: Draft } & Editing) {
  const model = getTemplate(draft.template);
  const headingId = useId();
  const title = draft.title.trim() || model.name;
  const product = draft.product.trim() || "NOME DO PRODUTO";
  const lines = splitLines(product.toLocaleUpperCase("pt-BR"));
  const detailRows = draft.description.trim().split("\n").length;
  const detailStep = Math.min(19, 42 / Math.max(2, detailRows + draft.quantity.trim().split("\n").length));
  const goodDates = !draft.start || !draft.end || draft.start <= draft.end;
  let period: ReactNode = null;
  if (goodDates && draft.start && draft.end) period = `${dateLabel(draft.start)} a ${dateLabel(draft.end)}`;
  else if (goodDates && draft.start) period = `A partir de ${dateLabel(draft.start)}`;
  else if (goodDates && draft.end) period = `Até ${dateLabel(draft.end)}`;

  return (
    <svg className="poster" xmlns="http://www.w3.org/2000/svg" viewBox={draft.print.orientation === "landscape" ? "0 0 594 420" : "0 0 420 594"} style={{aspectRatio:draft.print.orientation === "landscape" ? "594 / 420" : "420 / 594"}}
      role="img" aria-labelledby={headingId}>
      <title id={headingId}>{title} · {product}</title>
      <defs><linearGradient id={headingId + "-paper"} x2="0" y2="1"><stop stopColor="#ffe500"/><stop offset=".55" stopColor="#ffe500"/><stop offset="1" stopColor="#fafafa"/></linearGradient></defs>
      {!draft.print.preprinted && <g transform={draft.print.orientation === "landscape" ? "scale(1.4142857143 0.7070707071)" : undefined}>
      <rect width={width} height={height} fill={model.paper} />
      <rect width={width} height="210" fill={model.header} />
      <Decoration model={model} gradientId={headingId + "-paper"} />
      </g>}
      {draft.images.filter((item) => item.behind && !draft.print.preprinted).map((item) => <Editable key={item.id} name={"image:" + item.id} draft={draft} editing={editing}>
        <image href={item.source} x={210-item.width/2} y={330-item.height/2} width={item.width} height={item.height} preserveAspectRatio="xMidYMid meet" />
      </Editable>)}
      {!draft.print.preprinted && <Editable name="title" draft={draft} editing={editing}>
      {(title.includes("\n") ? title.split("\n") : title === "SUPER OFERTA" ? ["SUPER", "OFERTA"] : title === "OFERTA DO DIA" ? ["OFERTA", "DO DIA"] : [title]).map((line,index,headings) => <FittedText key={index} y={headings.length === 1 ? 76 : 25 + (index + 0.5) * (120 / headings.length)} size={headings.length === 1 ? 103 : Math.min(82, 145 / headings.length)} appearance={(draft.appearance.title ?? defaultAppearance)} fallback={model.title}>{line.toLocaleUpperCase("pt-BR")}</FittedText>)}
      </Editable>}
      <Editable name="product" draft={draft} editing={editing}>
      {lines.map((line, index) => (
        <FittedText key={index} y={245 + (index - (lines.length - 1) / 2) * Math.min(45, 110 / lines.length)} size={72}
          appearance={(draft.appearance.product ?? defaultAppearance)} fallback="#171717" maxSize={lines.length > 1 ? Math.min(54, 110 / lines.length) : 72}>
          {line}
        </FittedText>
      ))}
      </Editable>
      {draft.showDetails && (["description", "quantity"] as const).map((name, index) => {
        const text = draft[name].trim();
        const appearance = draft.appearance[name] ?? defaultAppearance;
        return text && text.toLocaleUpperCase("pt-BR") !== draft.unit ? <Editable key={name} name={name} draft={draft} editing={editing}>
          {text.split("\n").map((line, row) => <FittedText key={row} y={302 + (index === 0 ? row : detailRows + row) * detailStep} size={Math.min(22,detailStep * 0.8)} appearance={appearance} fallback="#242424">{line}</FittedText>)}
        </Editable> : null;
      })}
      <Editable name="price" draft={draft} editing={editing}><PriceBlock draft={draft} model={model} /></Editable>
      <Editable name="unit" draft={draft} editing={editing}><PriceBlock draft={draft} model={model} unitOnly /></Editable>
      {draft.extraTexts.map((item) => {
        const rows = splitLines(item.text);
        const appearance = draft.appearance["text:" + item.id] ?? defaultAppearance;
        return <Editable key={item.id} name={"text:" + item.id} draft={draft} editing={editing}><g fill={appearance.color || "#171717"} fontFamily={posterFont(appearance.font)} fontWeight="800">
          {rows.map((line, index) => <text key={index} x={item.x} y={item.y + index * item.size * 1.2} textAnchor={position(appearance.alignment).anchor} fontSize={item.size}
            textLength={Math.min(336, Math.max(1, line.length * item.size * 0.46))} lengthAdjust="spacingAndGlyphs">{line}</text>)}
        </g></Editable>;
      })}
      {draft.showDetails && (
        <g textAnchor="middle" fontFamily="Arial" fontSize="13" fontWeight="700" fill="#242424">
          {period && <Editable name="period" draft={draft} editing={editing}><FittedText y={554} size={13} appearance={draft.appearance.period ?? defaultAppearance} fallback="#242424">{String(period)}</FittedText></Editable>}
          {draft.barcode && <Editable name="barcode" draft={draft} editing={editing}><FittedText y={period ? 571 : 561} size={13} appearance={draft.appearance.barcode ?? defaultAppearance} fallback="#242424">{"Cód. " + draft.barcode}</FittedText></Editable>}
        </g>
      )}
      {draft.images.filter((item) => !item.behind && !draft.print.preprinted).map((item) => <Editable key={item.id} name={"image:" + item.id} draft={draft} editing={editing}>
        <image href={item.source} x={210-item.width/2} y={330-item.height/2} width={item.width} height={item.height} preserveAspectRatio="xMidYMid meet" />
      </Editable>)}
    </svg>
  );
}



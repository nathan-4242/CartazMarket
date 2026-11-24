export const papers = {
  A2: [420, 594], A3: [300, 420], A4: [210, 300], A5: [148, 210], A6: [105, 148],
} as const;
export type PrintSettings = {
  paper: keyof typeof papers;
  orientation: "portrait" | "landscape";
  margin: number;
  preprinted: boolean;
  a5Double?: boolean;
  a6Quad?: boolean;
};
export const defaultPrint: PrintSettings = {paper:"A4",orientation:"portrait",margin:5,preprinted:false};
export function isA5Double(settings: PrintSettings) {
  return settings.paper === "A5" && settings.orientation === "landscape" && settings.a5Double === true;
}

export function isA6Quad(settings: PrintSettings) {
  return settings.paper === "A6" && settings.orientation === "portrait" && settings.a6Quad === true;
}

export function pageDimensions(settings: PrintSettings) {
  if (isA6Quad(settings)) return {width:210,height:300};
  if (isA5Double(settings)) return {width:300,height:210};
  const [short,long] = papers[settings.paper];
  return settings.orientation === "landscape" ? {width:long,height:short} : {width:short,height:long};
}
export function normalizePrint(value: Partial<PrintSettings> | undefined): PrintSettings {
  return {
    paper:value?.paper && Object.hasOwn(papers,value.paper) ? value.paper : "A4",
    orientation:value?.orientation === "landscape" ? "landscape" : "portrait",
    margin:typeof value?.margin === "number" && Number.isFinite(value.margin) ? Math.min(20,Math.max(0,value.margin)) : 5,
    ...(value?.paper === "A6" && value.orientation !== "landscape" && value.a6Quad === true ? {a6Quad:true} : {}),
    preprinted:value?.preprinted === true,
    ...(value?.paper === "A5" && value.orientation === "landscape" && value.a5Double === true ? {a5Double:true} : {}),
  };
}

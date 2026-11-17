export const papers = {
  A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210], A6: [105, 148],
} as const;
export type PrintSettings = {
  paper: keyof typeof papers;
  orientation: "portrait" | "landscape";
  margin: number;
  preprinted: boolean;
};
export const defaultPrint: PrintSettings = {paper:"A4",orientation:"portrait",margin:5,preprinted:false};
export function pageDimensions(settings: PrintSettings) {
  const [short,long] = papers[settings.paper];
  return settings.orientation === "landscape" ? {width:long,height:short} : {width:short,height:long};
}
export function normalizePrint(value: Partial<PrintSettings> | undefined): PrintSettings {
  return {
    paper:value?.paper && Object.hasOwn(papers,value.paper) ? value.paper : "A4",
    orientation:value?.orientation === "landscape" ? "landscape" : "portrait",
    margin:typeof value?.margin === "number" && Number.isFinite(value.margin) ? Math.min(20,Math.max(0,value.margin)) : 5,
    preprinted:value?.preprinted === true,
  };
}

export const fontFiles: Record<string,string> = {
  "Cartaz Condensed": "/fonts/BarlowCondensed-ExtraBoldItalic.ttf",
  "PT Serif": "/fonts/PTSerif-Bold.ttf",
  "Barlow": "/fonts/Barlow-Bold.ttf",
};
export function posterFont(font: string) {
  if (font === "Georgia" || font === "PT Serif") return "PT Serif";
  if (font === "Verdana" || font === "Tahoma" || font === "Barlow") return "Barlow";
  return "Cartaz Condensed";
}

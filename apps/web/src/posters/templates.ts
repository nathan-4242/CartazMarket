export const templates = [
  { id: "oferta", name: "OFERTA", header: "#c90000", title: "#ffffff", paper: "#e00000", accent: "#ffffff", price: "#a80000", motif: "badge" },
  { id: "promocao", name: "PROMOÇÃO", header: "#0919bc", title: "#ffffff", paper: "#ffffff", accent: "#ffd600", price: "#c90000", motif: "stripe" },
  { id: "super", name: "SUPER OFERTA", header: "#a60000", title: "#ffffff", paper: "#ffffff", accent: "#ffd600", price: "#b60000", motif: "ribbon" },
  { id: "dia", name: "OFERTA DO DIA", header: "#c90000", title: "#ffe500", paper: "#ffe500", accent: "#a60000", price: "#a80000", motif: "frame" },
  { id: "atacado", name: "ATACADO", header: "#171717", title: "#ffd600", paper: "#fff8d1", accent: "#ffd600", price: "#b60000", motif: "band" },
  { id: "hortifruti", name: "HORTIFRUTI", header: "#00651b", title: "#ffffff", paper: "#ffffff", accent: "#f9d81d", price: "#b60000", motif: "curve" },
] as const;

export type Template = (typeof templates)[number];
export type TemplateId = Template["id"];

export function getTemplate(id: TemplateId): Template {
  return templates.find((template) => template.id === id) ?? templates[0];
}

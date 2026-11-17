import { sourceSchema, type Source } from "../connection/contracts";
import { defaultPrint, normalizePrint, type PrintSettings } from "./paper";
import { units, type Unit } from "./price";
import { templates, type TemplateId } from "./templates";

export const fonts = ["Arial", "PT Serif", "Barlow"] as const;
export const alignments = ["left", "center", "right"] as const;
export type Element = string;
export type Appearance = {
  font: (typeof fonts)[number];
  alignment: (typeof alignments)[number];
  color: string;
  scale: number;
  x: number;
  y: number;
};

export type PosterImage = { behind?: boolean; id: string; name: string; source: string; width: number; height: number };

export type Draft = {
  source?: Source;
  print: PrintSettings;
  images: PosterImage[];
  extraTexts: { id: string; text: string; x: number; y: number; size: number }[];
  template: TemplateId;
  title: string;
  product: string;
  description: string;
  quantity: string;
  price: string;
  unit: Unit;
  start: string;
  end: string;
  barcode: string;
  showDetails: boolean;
  appearance: Record<Element, Appearance>;
};

export const elementNames: Record<Element, string> = { title: "Título", product: "Produto", price: "Preço", unit: "Unidade", description: "Descrição", quantity: "Embalagem", period: "Validade", barcode: "Código" };
export const limits = { title: 34, product: 500, description: 70, quantity: 36, price: 22, barcode: 24 };

export const defaultAppearance: Appearance = { font: "Arial", alignment: "center", color: "", scale: 100, x: 0, y: 0 };
export const emptyDraft: Draft = {
  print: defaultPrint,
  images: [],
  extraTexts: [],
  template: "oferta", title: "", product: "", description: "", quantity: "", price: "",
  unit: "UNIDADE", start: "", end: "", barcode: "", showDetails: true,
  appearance: { title: defaultAppearance, product: defaultAppearance, price: defaultAppearance },
};

const storageKey = "cartazmarket:editor:a4:v1";

function readAppearance(value: unknown): Appearance {
  const candidate = (value ?? {}) as Partial<Appearance>;
  return {
    font: String(candidate.font) === "Georgia" ? "PT Serif" : ["Verdana","Tahoma"].includes(String(candidate.font)) ? "Barlow" : fonts.includes(candidate.font ?? "Arial") ? candidate.font ?? "Arial" : "Arial",
    alignment: alignments.includes(candidate.alignment ?? "center") ? candidate.alignment ?? "center" : "center",
    color: typeof candidate.color === "string" && /^#[0-9a-f]{6}$/i.test(candidate.color) ? candidate.color : "",
    scale: typeof candidate.scale === "number" && candidate.scale >= 30 && candidate.scale <= 200
      ? candidate.scale
      : 100,
    x: typeof candidate.x === "number" && Number.isFinite(candidate.x) ? candidate.x : 0,
    y: typeof candidate.y === "number" && Number.isFinite(candidate.y) ? candidate.y : 0,
  };
}

export function normalizeDraft(input: unknown): Draft {
  try {
    const value = input as Partial<Draft> | null;
    if (!value) return emptyDraft;
    const draft = { ...emptyDraft, print:normalizePrint(value.print) };
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      const field = value[key];
      if (typeof field === "string") draft[key] = field.slice(0, limits[key]);
    }
    for (const key of ["start", "end"] as const) {
      if (typeof value[key] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value[key])) draft[key] = value[key];
    }
    if (templates.some((item) => item.id === value.template)) draft.template = value.template ?? draft.template;
    if (typeof value.unit === "string" && value.unit.length > 0 && value.unit.length <= 16) draft.unit = value.unit as Unit;
    const source = sourceSchema.safeParse(value.source);
    if (source.success) draft.source = source.data;
    if (typeof value.showDetails === "boolean") draft.showDetails = value.showDetails;
    draft.extraTexts = Array.isArray(value.extraTexts) ? value.extraTexts.filter((item) =>
      item && typeof item.id === "string" && typeof item.text === "string" &&
      Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.size)
    ).map((item) => ({ ...item, text: item.text.slice(0, 500), size: Math.max(10, Math.min(100, item.size)) })) : [];
    draft.images = Array.isArray(value.images) ? value.images.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.source === "string" && /^data:image\/png;base64,/.test(item.source) && Number.isFinite(item.width) && item.width > 0 && Number.isFinite(item.height) && item.height > 0) : [];
    draft.appearance = {
      title: readAppearance(value.appearance?.title),
      product: readAppearance(value.appearance?.product),
      price: readAppearance(value.appearance?.price),
    };
    for (const [key, appearance] of Object.entries(value.appearance ?? {})) {
      if (key !== "__proto__" && key !== "constructor") draft.appearance[key] = readAppearance(appearance);
    }
    return draft;
  } catch {
    return emptyDraft;
  }
}

export function readDraft(): Draft {
  try { return normalizeDraft(JSON.parse(localStorage.getItem(storageKey) ?? "{}")); }
  catch { return structuredClone(emptyDraft); }
}

export function saveDraft(draft: Draft) {
  localStorage.setItem(storageKey, JSON.stringify(draft));
}

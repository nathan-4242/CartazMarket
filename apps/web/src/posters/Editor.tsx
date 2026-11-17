import { useLocation, useNavigate } from "react-router-dom";
import { RemoteLabel } from "../connection/RemoteLabel";
import { PrintControls } from "./PrintControls";
import { pageDimensions } from "./paper";
import { Inspector } from "./Inspector";
import { PosterLibrary, archive } from "./PosterLibrary";
import { importImage } from "./images";
import { useEffect, useReducer, useState } from "react";
import { Grid2X2, Maximize2, Redo2, Save, Undo2 } from "lucide-react";
import { defaultAppearance, elementNames, limits, readDraft, saveDraft, type Appearance, type Draft, type Element } from "./draft";
import { PaperPreview as Poster } from "./PaperPreview";
import { parsePrice, units, type Unit } from "./price";
import { getTemplate, templates, type TemplateId } from "./templates";
import "./editor.css";

type History = { past: Draft[]; current: Draft; future: Draft[] };
type Action = { type: "load"; draft: Draft } | { type: "image"; image: Draft["images"][number] } | { type: "change"; patch: Partial<Draft> } | { type: "undo" } | { type: "redo" };

function historyReducer(history: History, action: Action): History {
  if (action.type === "load") return {past:[],current:action.draft,future:[]};
  const { past, current, future } = history;
  if (action.type === "image") return {past: [...past.slice(-59), current], current: {...current, images: [...current.images, action.image]}, future: []};
  if (action.type === "change") {
    if (Object.entries(action.patch).every(([key, value]) => current[key as keyof Draft] === value)) return history;
    return { past: [...past.slice(-59), current], current: { ...current, ...action.patch }, future: [] };
  }
  if (action.type === "undo") {
    const previous = past.at(-1);
    return previous ? { past: past.slice(0, -1), current: previous, future: [current, ...future] } : history;
  }
  const next = future[0];
  return next ? { past: [...past, current], current: next, future: future.slice(1) } : history;
}

const baseElements = ["title", "product", "price", "unit", "description", "quantity", "period", "barcode"];
const textFields = [
  ["title", "Título do cartaz"], ["product", "Nome do produto"], ["description", "Marca ou descrição"],
  ["quantity", "Quantidade ou embalagem"],
] as const;

function TemplatePicker({ draft, choose, previews }: {
  draft: Draft;
  choose: (id: TemplateId) => void;
  previews: boolean;
}) {
  return (
    <div className={previews ? "poster-gallery" : "template-list"}>
      {templates.map((template) => (
        <button key={template.id} type="button" className="template-option"
          aria-label={`Aplicar modelo ${template.name}`}
          aria-pressed={draft.template === template.id} onClick={() => choose(template.id)}>
          {previews
            ? <Poster draft={{ ...draft, template: template.id }} />
            : <span className="template-swatch" style={{ background: template.header, borderBottomColor: template.accent }} />}
          <span>{template.name}</span>
        </button>
      ))}
    </div>
  );
}

export function Editor({ gallery = false, printing = false }: { gallery?: boolean; printing?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [importError,setImportError] = useState("");
  const [history, dispatch] = useReducer(historyReducer, null, () => ({ past: [], current: readDraft(), future: [] }));
  const [mode, setMode] = useState<"editor" | "gallery">(gallery ? "gallery" : "editor");
  const [element, setElement] = useState<Element>("title");
  const [zoom, setZoom] = useState(100);
  const [imageStatus, setImageStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const draft = history.current;
  const elements = [...baseElements, ...draft.extraTexts.map((item) => "text:" + item.id), ...draft.images.map((item) => "image:" + item.id)];
  const names = {...elementNames, ...Object.fromEntries(draft.extraTexts.map((item,index) => ["text:" + item.id, "Texto " + (index+1) + " · " + item.text.slice(0,20)])), ...Object.fromEntries(draft.images.map((item) => ["image:" + item.id, item.name]))};
  useEffect(() => {
    if (!elements.includes(element)) setElement("title");
  }, [element, elements.join("|")]);
  const model = getTemplate(draft.template);
  const appearance = draft.appearance[element] ?? defaultAppearance;
  const defaultColor = ({ title: model.title, price: model.price } as Record<string,string>)[element] ?? "#171717";
  const priceError = !!draft.price.trim() && !parsePrice(draft.price);
  const periodError = !!draft.start && !!draft.end && draft.start > draft.end;

  function change(patch: Partial<Draft>) {
    dispatch({ type: "change", patch });
  }

  function style(patch: Partial<Appearance>) {
    change({ appearance: { ...draft.appearance, [element]: { ...appearance, ...patch } } });
  }

  function persist(draft: Draft) {
    try {
      saveDraft(draft);
      setSaveStatus("Rascunho salvo neste navegador");
    } catch {
      setSaveStatus("Armazenamento local indisponível");
    }
  }

  useEffect(() => persist(draft), [draft]);

  useEffect(() => {
    const incoming = location.state as {connectedDraft?: Draft;requestId?:string} | null;
    if (!incoming?.connectedDraft) return;
    try {
      archive(draft);
      dispatch({type:"load",draft:incoming.connectedDraft});
      setElement("title");
      setImportError("");
      navigate(location.pathname,{replace:true,state:null});
    } catch {
      setImportError("Não foi possível guardar o rascunho atual antes de abrir o cartaz da loja. Verifique o espaço do navegador.");
    }
  }, [location.key]);

  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        persist(draft);
        return;
      }
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
      if (key === "z" || key === "y") {
        event.preventDefault();
        dispatch({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
      }
    }

    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [draft]);

  return (
    <>
      <header className="topbar">
        <span>{printing ? "Impressão" : gallery ? "Modelos" : "Editor de Cartazes"}</span>
        <span className="draft-status" role="status"><Save size={15} aria-hidden="true" />{saveStatus}</span>
      </header>
      <main className="editor-main" id="conteudo">
        <div className="editor-intro">
          <div>
            <h1>{printing ? "Imprimir cartaz" : gallery ? "Modelos de cartaz" : "Editor de cartazes"}</h1>
            <p>Preencha os dados da oferta e personalize seu cartaz.</p>
          </div>
          <div className="editor-actions" aria-label="Ações de edição">
            <PosterLibrary draft={draft} disabled={importing} load={(next) => { dispatch({type:"load",draft:next}); setElement("title"); setImageStatus(""); setMode("editor"); }} />
            <button type="button" className="tool-button" disabled={!history.past.length} onClick={() => dispatch({ type: "undo" })}>
              <Undo2 size={17} />Desfazer
            </button>
            <button type="button" className="tool-button" disabled={!history.future.length} onClick={() => dispatch({ type: "redo" })}>
              <Redo2 size={17} />Refazer
            </button>
            <button type="button" className="tool-button" onClick={() => persist(draft)}>
              <Save size={17} />Salvar rascunho
            </button>
          </div>
        </div>

        {importError && <p role="alert">{importError}</p>}
        {draft.source && <RemoteLabel key={draft.source.labelId} source={draft.source}/>}
        <div className="editor-layout">
          <section className="editor-panel" aria-labelledby="poster-data">
            <h2 id="poster-data">Dados do cartaz</h2>
            <label>Modelo
              <select value={draft.template} onChange={(event) => change({ template: event.target.value as TemplateId })}>
                {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {textFields.map(([key, label]) => (
              <label key={key} htmlFor={"poster-field-" + key}>{label}
                <textarea disabled={!!draft.source && key === "product"} aria-label={label} id={"poster-field-" + key} rows={2} value={draft[key]} maxLength={limits[key]} placeholder={key === "title" ? model.name : undefined}
                  onChange={(event) => change({ [key]: event.target.value })} />
              </label>
            ))}
            <button className="tool-button" type="button" onClick={() => change({ extraTexts: [...draft.extraTexts, { id: crypto.randomUUID(), text: "Novo texto", x: 210, y: 340, size: 28 }] })}>Adicionar texto</button>
            {draft.extraTexts.map((item, index) => <div className="extra-text" key={item.id}>
              <label>Texto adicional {index + 1}
                <textarea rows={3} maxLength={500} value={item.text} onChange={(event) => change({ extraTexts: draft.extraTexts.map((text) => text.id === item.id ? { ...text, text: event.target.value } : text) })} />
              </label>
              {(["x", "y", "size"] as const).map((field) => <label key={field}>{ {x:"Posição horizontal",y:"Posição vertical",size:"Tamanho do texto"}[field] }
                <input type="number" value={item[field]} min={field === "size" ? 10 : undefined} max={field === "size" ? 100 : undefined} onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isFinite(value)) change({extraTexts: draft.extraTexts.map((text) => text.id === item.id ? {...text, [field]: field === "size" ? Math.max(10, Math.min(100, value)) : value} : text)});
                }} />
              </label>)}
              <button className="tool-button" type="button" onClick={() => { if (window.confirm("Remover este texto do cartaz?")) change({ extraTexts: draft.extraTexts.filter((text) => text.id !== item.id) }); }}>Remover texto</button>
            </div>)}
            <label>Preço (R$)
              <input disabled={!!draft.source} value={draft.price} type="text" inputMode="decimal" placeholder="0,00" maxLength={limits.price}
                aria-invalid={priceError} aria-describedby={priceError ? "price-error" : undefined}
                onChange={(event) => change({ price: event.target.value })} />
            </label>
            {priceError && <small className="field-error" id="price-error">Use o formato brasileiro, por exemplo 1.299,00.</small>}
            <label>Unidade de comercialização
              <select disabled={!!draft.source} value={draft.unit} onChange={(event) => change({ unit: event.target.value as Unit })}>
                {!units.includes(draft.unit) && <option value={draft.unit}>{draft.unit}</option>}
                {units.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>Início da promoção
              <input disabled={!!draft.source} type="date" value={draft.start} max="9999-12-31" onChange={(event) => change({ start: event.target.value })} />
            </label>
            <label>Fim da promoção
              <input disabled={!!draft.source} type="date" value={draft.end} min={draft.start || undefined} max="9999-12-31"
                aria-invalid={periodError} aria-describedby={periodError ? "period-error" : undefined}
                onChange={(event) => change({ end: event.target.value })} />
            </label>
            {periodError && <small className="field-error" id="period-error">O fim deve ser igual ou posterior ao início.</small>}
            <label>Código de barras
              <input value={draft.barcode} inputMode="numeric" maxLength={limits.barcode}
                onChange={(event) => change({ barcode: event.target.value.replace(/\D/g, "") })} />
            </label>
            <label className="checkbox"><input type="checkbox" checked={draft.showDetails}
              onChange={(event) => change({ showDetails: event.target.checked })} />Exibir informações adicionais</label>
          </section>

          <section className="editor-stage" aria-label="Pré-visualização do cartaz">
            <PrintControls draft={draft} change={(print) => change({print})} />
            <div className="stage-toolbar">
              <div className="segmented" aria-label="Modo de visualização">
                <button type="button" aria-pressed={mode === "editor"} onClick={() => setMode("editor")}><Maximize2 size={15} /> Editor</button>
                <button type="button" aria-pressed={mode === "gallery"} onClick={() => setMode("gallery")}><Grid2X2 size={15} /> Galeria</button>
              </div>
              {mode === "editor" && (
                <select className="zoom" aria-label="Zoom" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
                  {[60, 80, 100, 125, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}
                </select>
              )}
            </div>
            {mode === "editor"
              ? <div className="poster-scroll"><div className="poster-sheet" style={{ width: `${zoom}%`, maxWidth: 435 * zoom / 100 }}><Poster draft={draft} selected={element} onSelect={(name) => { setElement(name); }} onResize={(name, scale) => change({ appearance: {...draft.appearance, [name]: {...(draft.appearance[name] ?? defaultAppearance), scale}} })} onMove={(name, x, y) => change({ appearance: { ...draft.appearance, [name]: { ...(draft.appearance[name] ?? defaultAppearance), x, y } } })} /></div></div>
              : <TemplatePicker draft={draft} previews choose={(template) => {
                change({ template });
                setMode("editor");
              }} />}
            <div className="stage-footer">{draft.print.paper} · {pageDimensions(draft.print).width} × {pageDimensions(draft.print).height} mm · {draft.print.preprinted ? "Papel pré-impresso" : "Colorido"}</div>
          </section>

          <Inspector draft={draft} element={element} names={names} elements={elements}
            appearance={appearance} defaultColor={defaultColor} importing={importing} imageStatus={imageStatus}
            select={setElement} style={style} change={change} upload={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setImporting(true);
              setImageStatus("Abrindo imagem…");
              try {
                const image = await importImage(file);
                dispatch({type:"image",image});
                setElement("image:"+image.id);
                setMode("editor");
                setImageStatus("Imagem adicionada.");
              } catch(error) {
                setImageStatus(error instanceof Error ? error.message : "Não foi possível abrir a imagem.");
              } finally {
                setImporting(false);
              }
            }} />
        </div>
      </main>
    </>
  );
}



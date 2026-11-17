import { useRef, useState } from "react";
import { FolderOpen, Plus, X } from "lucide-react";
import { emptyDraft, normalizeDraft, type Draft } from "./draft";
import { PaperPreview as Poster } from "./PaperPreview";

type SavedPoster = {id:string; savedAt:string; draft:Draft};
const key = "cartazmarket:local-posters:v1";

export function readPosters(): SavedPoster[] {
  const data: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
  if (!Array.isArray(data) || data.some((item)=>typeof item?.id !== "string" || !item.draft || typeof item.draft !== "object" || Array.isArray(item.draft))) {
    throw new Error("Não foi possível ler os cartazes salvos neste navegador.");
  }
  return data.map((item) => ({id:item.id,savedAt:typeof item.savedAt === "string" ? item.savedAt : "",draft:normalizeDraft(item.draft)}));
}

export function archive(draft: Draft): SavedPoster[] {
  const saved = readPosters();
  const hasContent = draft.product || draft.price || draft.title || draft.description || draft.quantity || draft.barcode || draft.start || draft.end || draft.images.length || draft.extraTexts.length;
  if (!hasContent || saved.some((item)=>JSON.stringify(item.draft)===JSON.stringify(draft))) return saved;
  const next = [{id:crypto.randomUUID(),savedAt:new Date().toISOString(),draft},...saved];
  localStorage.setItem(key,JSON.stringify(next));
  return next;
}

export function PosterLibrary({draft,load,disabled}: {draft:Draft;load:(draft:Draft)=>void;disabled:boolean}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved,setSaved] = useState<SavedPoster[]>([]);
  const [isOpen,setIsOpen] = useState(false);
  const [error,setError] = useState("");

  function openLibrary() {
    try {setSaved(readPosters());setError("");} catch {setSaved([]);setError("Não foi possível ler os cartazes salvos neste navegador.");}
    setIsOpen(true);
    dialog.current?.showModal();
  }

  function switchPoster(next: Draft) {
    try {
      setSaved(archive(draft));
      setError("");
      load(structuredClone(next));
      dialog.current?.close();
    } catch {
      setError("Não foi possível salvar o cartaz atual. O armazenamento do navegador pode estar cheio. Seu cartaz continua aberto.");
    }
  }

  return <>
    <button className="tool-button" type="button" disabled={disabled} onClick={openLibrary}><FolderOpen size={17}/>Cartazes salvos</button>
    <button className="button new-poster" type="button" disabled={disabled} onClick={()=>switchPoster({...emptyDraft,template:draft.template,print:draft.print})}><Plus size={18}/>Novo cartaz</button>
    {error && !isOpen && <span className="library-error" role="alert">{error}</span>}
    <dialog onClose={()=>setIsOpen(false)} ref={dialog} className="poster-library" aria-labelledby="library-title">
      <div className="library-header"><div><h2 id="library-title">Cartazes salvos</h2><p>Disponíveis neste navegador.</p></div><button className="icon-button" type="button" aria-label="Fechar cartazes salvos" onClick={()=>dialog.current?.close()}><X size={18}/></button></div>
      {error && <p className="library-error" role="alert">{error}</p>}
      {!saved.length && !error && <p className="library-empty">Ao criar um novo cartaz, o atual será guardado aqui.</p>}
      <div className="saved-posters">{saved.map((item)=><button type="button" key={item.id} onClick={()=>switchPoster(item.draft)}><div className="saved-preview"><Poster draft={item.draft}/></div><strong>{item.draft.product||item.draft.title||"Cartaz sem título"}</strong><span>{Number.isNaN(Date.parse(item.savedAt)) ? "Salvo neste navegador" : new Date(item.savedAt).toLocaleDateString("pt-BR")}</span></button>)}</div>
    </dialog>
  </>;
}

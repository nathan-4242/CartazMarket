import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImagePlus, Layers, Minus, Plus, RotateCcw, Trash2, Type } from "lucide-react";
import { alignments, fonts, type Appearance, type Draft } from "./draft";
import { type ChangeEvent } from "react";

type Props = {
  draft: Draft;
  element: string;
  names: Record<string,string>;
  elements: string[];
  appearance: Appearance;
  defaultColor: string;
  importing: boolean;
  imageStatus: string;
  select: (element: string) => void;
  style: (patch: Partial<Appearance>) => void;
  change: (patch: Partial<Draft>) => void;
  upload: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function Inspector({draft,element,names,elements,appearance,defaultColor,importing,imageStatus,select,style,change,upload}: Props) {
  const image = draft.images.find((item) => "image:"+item.id === element);
  const isImage = !!image;
  const directions = [
    {icon:ArrowLeft,name:"esquerda",x:-5,y:0},
    {icon:ArrowUp,name:"cima",x:0,y:-5},
    {icon:ArrowDown,name:"baixo",x:0,y:5},
    {icon:ArrowRight,name:"direita",x:5,y:0},
  ];
  return <section className="editor-panel appearance inspector" aria-labelledby="poster-style">
    <div className="inspector-heading"><div className="inspector-symbol">{isImage ? <ImagePlus size={19}/> : <Type size={19}/>}</div><div><h2 id="poster-style">Ajustar elemento</h2><p>Personalize seu cartaz</p></div></div>
    <div className="inspector-section">
      <label>Elemento selecionado
        <select aria-label="Selecionar elemento" value={element} onChange={(event)=>select(event.target.value)}>
          {elements.map((item)=><option key={item} value={item}>{names[item]}</option>)}
        </select>
      </label>
      <p className="adjust-help">Clique no cartaz ou escolha na lista.</p>
    </div>
    <div className="inspector-section">
      <h3>Posição</h3>
      <div className="position-fields">
        <label>Horizontal<input type="number" value={appearance.x} onChange={(event)=>{if(Number.isFinite(event.target.valueAsNumber))style({x:event.target.valueAsNumber});}}/></label>
        <label>Vertical<input type="number" value={appearance.y} onChange={(event)=>{if(Number.isFinite(event.target.valueAsNumber))style({y:event.target.valueAsNumber});}}/></label>
      </div>
      <div className="nudge-controls">{directions.map(({icon:Icon,name,x,y})=><button className="tool-button" type="button" key={name} title={"Mover para "+name} aria-label={"Mover para "+name} onClick={()=>style({x:appearance.x+x,y:appearance.y+y})}><Icon size={17}/></button>)}</div>
    </div>
    <div className="inspector-section">
      <div className="section-label"><h3>Tamanho</h3><output>{appearance.scale}%</output></div>
      <div className="size-controls">
        <button className="tool-button" type="button" aria-label="Diminuir tamanho" disabled={appearance.scale<=30} onClick={()=>style({scale:Math.max(30,appearance.scale-5)})}><Minus size={16}/></button>
        <input aria-label="Tamanho do elemento" type="range" min="30" max="200" step="1" value={appearance.scale} onChange={(event)=>style({scale:event.target.valueAsNumber})}/>
        <button className="tool-button" type="button" aria-label="Aumentar tamanho" disabled={appearance.scale>=200} onClick={()=>style({scale:Math.min(200,appearance.scale+5)})}><Plus size={16}/></button>
      </div>
      <button className="reset-button" type="button" onClick={()=>style({x:0,y:0,scale:100})}><RotateCcw size={14}/>Restaurar posição e tamanho</button>
    </div>
    {!isImage && <div className="inspector-section">
      <h3>Texto</h3>
      <label>Fonte<select value={appearance.font} onChange={(event)=>style({font:event.target.value as Appearance["font"]})}>{fonts.map((font)=><option key={font} value={font}>{font==="Arial" ? "Padrão do cartaz" : font}</option>)}</select></label>
      <label>Alinhamento<select value={appearance.alignment} onChange={(event)=>style({alignment:event.target.value as Appearance["alignment"]})}>{alignments.map((value)=><option key={value} value={value}>{{left:"Esquerda",center:"Centro",right:"Direita"}[value]}</option>)}</select></label>
      <div className="color-controls"><label>Cor<input type="color" value={appearance.color||defaultColor} onChange={(event)=>style({color:event.target.value})}/></label><button className="reset-button" type="button" disabled={!appearance.color} onClick={()=>style({color:""})}>Usar cor do modelo</button></div>
    </div>}
    {image && <div className="inspector-section">
      <h3>Imagem</h3>
      <div className="selected-image"><img src={image.source} alt=""/><span title={image.name}>{image.name}</span></div>
      <button className="tool-button" type="button" onClick={()=>change({images:draft.images.map((item)=>item.id===image.id?{...item,behind:!item.behind}:item)})}><Layers size={16}/>{image.behind?"Trazer para frente":"Enviar para trás"}</button>
      <button className="reset-button remove-button" type="button" onClick={()=>{if(window.confirm("Remover esta imagem?")){change({images:draft.images.filter((item)=>item.id!==image.id)});select("title");}}}><Trash2 size={14}/>Remover imagem</button>
    </div>}
    <div className="inspector-section insert-section">
      <label className="image-upload"><ImagePlus size={17}/>{importing?"Abrindo imagem…":"Adicionar imagem"}<input aria-label="Adicionar imagem" type="file" accept="image/*,.heic,.heif,.tif,.tiff" disabled={importing} onChange={upload}/></label>
      {imageStatus && <span className="image-status" role="status">{imageStatus}</span>}
    </div>
  </section>;
}

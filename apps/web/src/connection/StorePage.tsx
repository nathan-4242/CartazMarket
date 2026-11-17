import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { RequireStore, useConnection } from "./Auth";
import { service, pageSize } from "./service";
import { decimalToBrazilian, decimalToCents, labelNames, promotionNames, type Product, type Label } from "./contracts";
import { labelToDraft } from "./labelDraft";
import { parsePrice } from "../posters/price";

type Section = "products"|"promotions"|"labels";
const titles:Record<Section,string>={products:"Produtos",promotions:"Promoções",labels:"Meus cartazes"};
function dateTime(value:string){return new Date(value).toLocaleString("pt-BR");}

function PromotionForm({product,close,created}:{product:Product;close:()=>void;created:()=>void}){
  const {store}=useConnection();
  const [price,setPrice]=useState("");
  const [start,setStart]=useState("");
  const [end,setEnd]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  return <form className="promotion-form" onSubmit={async(event)=>{
    event.preventDefault();if(!store||busy)return;
    const parsed=parsePrice(price);
    if(!parsed){setError("Informe um preço brasileiro válido.");return;}
    const amount=parsed.whole.replace(/\./g,"")+"."+parsed.cents;
    if(decimalToCents(amount)>=decimalToCents(product.currentAmount)){setError("O preço promocional deve ser menor que o preço atual.");return;}
    const from=new Date(start),to=new Date(end);
    if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from.getTime()<=Date.now()||to<=from){setError("Escolha um início futuro e um término posterior ao início.");return;}
    setBusy(true);setError("");
    try{await service.createPromotion(store.id,{productId:product.productId,promotionalAmount:amount,startsAt:from.toISOString(),endsAt:to.toISOString()});created();}
    catch(error){setError(error instanceof Error?error.message:"Não foi possível criar a promoção.");}
    finally{setBusy(false);}
  }}>
    <h2>Agendar promoção · {product.name}</h2>
    <p>Preço atual R$ {decimalToBrazilian(product.currentAmount)}. Horários no fuso deste dispositivo.</p>
    <div className="form-row">
      <label>Preço promocional<input aria-label="Preço promocional" inputMode="decimal" required value={price} onChange={(e)=>setPrice(e.target.value)}/></label>
      <label>Início<input aria-label="Início" type="datetime-local" required value={start} onChange={(e)=>setStart(e.target.value)}/></label>
      <label>Término<input aria-label="Término" type="datetime-local" required value={end} onChange={(e)=>setEnd(e.target.value)}/></label>
    </div>
    {error&&<p role="alert">{error}</p>}
    <div className="form-actions"><button className="button" disabled={busy}>Agendar promoção</button><button className="tool-button" type="button" disabled={busy} onClick={close}>Fechar</button></div>
  </form>;
}

function StoreData({section}:{section:Section}){
  const {store,session,canManage}=useConnection();
  const queryClient=useQueryClient();
  const navigate=useNavigate();
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const [search,setSearch]=useState("");
  const [query,setQuery]=useState("");
  const [offset,setOffset]=useState(0);
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [promotionProduct,setPromotionProduct]=useState<Product|null>(null);
  useEffect(()=>{
    const timer=setTimeout(()=>{setQuery(search);setOffset(0);},350);
    return ()=>clearTimeout(timer);
  },[search]);
  const id=store!.id;
  const userId=session!.user.id;
  const list=useQuery<Awaited<ReturnType<typeof service.products>> | Awaited<ReturnType<typeof service.promotions>> | Awaited<ReturnType<typeof service.labels>>>({
    queryKey:["store",userId,id,section,query,status,offset],
    queryFn:({signal})=>{
      if(section==="products")return service.products(id,query,offset,signal);
      if(section==="promotions")return service.promotions(id,status,offset,signal);
      return service.labels(id,status,offset,signal);
    },
    retry:false,
  });
  const products=list.data&&"products"in list.data?list.data.products:[];
  const promotions=list.data&&"promotions"in list.data?list.data.promotions:[];
  const labels=list.data&&"labels"in list.data?list.data.labels:[];
  const count=products.length+promotions.length+labels.length;
  async function action(key:string,run:()=>Promise<void>){
    if(busy)return;setBusy(key);setMessage("");
    try{await run();}
    catch(error){setMessage(error instanceof Error?error.message:"Não foi possível concluir.");}
    finally{setBusy("");}
  }
  async function create(productId:string,promotionId?:string){
    const result=await service.createLabel(id,productId,promotionId);
    const label={...result.label,productName:result.productName,unit:result.unit};
    await queryClient.invalidateQueries({queryKey:["store",userId,id,"labels"]});
    if(active.current)open(label);
  }
  function open(label:Label){
    navigate("/editor",{state:{connectedDraft:labelToDraft(label,id,userId),requestId:crypto.randomUUID()}});
  }
  const statusNames=section==="promotions"?promotionNames:labelNames;
  return <>
    <div className="data-toolbar">
      {section==="products"?<label>Buscar produto por nome<input aria-label="Buscar produto por nome" type="search" maxLength={100} value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Digite o nome do produto"/></label>:<label>Status<select aria-label="Status" value={status} onChange={(e)=>{setStatus(e.target.value);setOffset(0);}}><option value="">Todos</option>{Object.entries(statusNames).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>}
      <button className="tool-button" disabled={list.isFetching||!!busy} onClick={()=>void list.refetch()}>Atualizar</button>
    </div>
    {section==="products"&&<p className="connection-footnote">A consulta disponível busca pelo nome. Códigos, categorias e preço promocional ainda precisam ser expostos pelo catálogo da API.</p>}
    {section==="labels"&&<p className="connection-footnote">Registros da loja. A composição visual personalizada permanece nos rascunhos deste navegador.</p>}
    {message&&<p className="api-error" role="alert">{message}</p>}
    {promotionProduct&&<PromotionForm product={promotionProduct} close={()=>setPromotionProduct(null)} created={()=>{setPromotionProduct(null);setMessage("Promoção agendada.");void queryClient.invalidateQueries({queryKey:["store",userId,id,"promotions"]});}}/>}
    {list.isPending?<p role="status">Carregando…</p>:list.error?<div className="api-error" role="alert"><p>{list.error.message}</p><button className="button" onClick={()=>void list.refetch()}>Tentar novamente</button></div>:!count?<div className="connection-empty">Nenhum registro encontrado.</div>:<div className="data-table-wrap"><table className="data-table">
      <thead><tr><th>Produto</th><th>{section==="products"?"Preço atual":"Valor"}</th><th>{section==="products"?"Unidade":"Status"}</th><th>{section==="promotions"?"Período":"Atualização"}</th><th>Ações</th></tr></thead>
      <tbody>
        {products.map((item)=><tr key={item.productId}><td>{item.name}</td><td>R$ {decimalToBrazilian(item.currentAmount)}</td><td>{item.unit}</td><td>{dateTime(item.priceUpdatedAt)}</td><td><div className="row-actions"><button className="button" disabled={!!busy} onClick={()=>void action(item.productId,()=>create(item.productId))}>Criar cartaz</button>{canManage&&<button className="tool-button" disabled={!!busy} onClick={()=>setPromotionProduct(item)}>Agendar promoção</button>}</div></td></tr>)}
        {promotions.map((item)=><tr key={item.id}><td>{item.productName}</td><td><small>De R$ {decimalToBrazilian(item.regularAmount)}</small><br/>R$ {decimalToBrazilian(item.promotionalAmount)}</td><td><span className="data-badge">{promotionNames[item.status]}</span></td><td>{dateTime(item.startsAt)}<br/>{dateTime(item.endsAt)}</td><td><div className="row-actions">{["scheduled","active"].includes(item.status)&&<><button className="button" disabled={!!busy} onClick={()=>void action(item.id,()=>create(item.productId,item.id))}>Criar cartaz</button>{canManage&&<button className="tool-button" disabled={!!busy} onClick={()=>{if(window.confirm("Cancelar esta promoção? Os cartazes impressos ficarão pendentes de retirada."))void action(item.id,async()=>{await service.cancelPromotion(id,item.id);await list.refetch();});}}>Cancelar</button>}</>}</div></td></tr>)}
        {labels.map((item)=><tr key={item.id}><td>{item.productName}<small className="record-id">{item.id}</small></td><td>R$ {decimalToBrazilian(item.displayAmount)}</td><td><span className="data-badge">{labelNames[item.status]}</span></td><td>{dateTime(item.createdAt)}</td><td><button className="tool-button" disabled={!!busy} onClick={()=>void action(item.id,async()=>open(item))}>Abrir no editor</button></td></tr>)}
      </tbody>
    </table></div>}
    <div className="pagination"><button className="tool-button" disabled={offset===0||list.isFetching||!!busy} onClick={()=>setOffset(Math.max(0,offset-pageSize))}>Anterior</button><span>Página {Math.floor(offset/pageSize)+1}</span><button className="tool-button" disabled={count<pageSize||list.isFetching||!!busy} onClick={()=>setOffset(offset+pageSize)}>Próxima</button></div>
  </>;
}
export function StorePage({section}:{section:Section}){
  const {store,session}=useConnection();
  return <><header className="topbar">{titles[section]}<span className="status">{store?.name}</span></header><main id="conteudo" className="connected-page"><h1>{titles[section]}</h1><RequireStore><StoreData key={[section,store?.id,session?.user.id].join(":")} section={section}/></RequireStore></main></>;
}


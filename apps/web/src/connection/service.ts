import { z } from "zod";
import { apiBase, supabase } from "./config";
import { identitySchema, productSchema, promotionSchema, labelSchema, labelCoreSchema, importResultSchema, priceChangeSchema } from "./contracts";

export class ApiError extends Error {
  constructor(message:string,public status:number,public code:string,public requestId?:string){super(message);}
}
const messages:Record<string,string>={
  STORE_NOT_FOUND:"Loja não encontrada ou acesso não autorizado.",
  INSUFFICIENT_ROLE:"Seu perfil não permite esta operação.",
  AUTH_NOT_CONFIGURED:"A autenticação da API ainda não foi configurada.",
  AUTH_VALIDATION_UNAVAILABLE:"A validação da sessão está temporariamente indisponível. Tente novamente em instantes.",
  PROMOTION_OVERLAP:"Já existe uma promoção nesse período.",
  PROMOTION_PRICE_OUTDATED:"O preço atual mudou. Revise a promoção antes de criar o cartaz.",
  PROMOTION_NOT_AVAILABLE:"A promoção foi encerrada, cancelada ou não está disponível.",
  PROMOTION_ALREADY_CANCELLED:"Esta promoção já foi cancelada.",
  LABEL_NOT_READY_TO_PRINT:"Este cartaz já foi impresso, cancelado ou não está disponível para impressão.",
  PRODUCT_PRICE_NOT_FOUND:"O produto não tem preço cadastrado nesta loja.",
  PROMO_PRICE_NOT_LOWER:"O preço promocional precisa ser menor que o preço atual.",
};
async function request(path:string,options:RequestInit={},html=false):Promise<unknown> {
  if(!supabase)throw new ApiError("Configure a conexão com Supabase para entrar.",503,"NOT_CONFIGURED");
  const {data,error}=await supabase.auth.getSession();
  if(error || !data.session)throw new ApiError("Entre na sua conta para continuar.",401,"UNAUTHENTICATED");
  const headers=new Headers(options.headers);
  headers.set("Authorization","Bearer "+data.session.access_token);
  if(options.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const signal=options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);
  let response:Response;
  try{response=await fetch(apiBase+path,{...options,headers,signal});}
  catch(error){
    if(options.signal?.aborted)throw error;
    throw new ApiError(options.method==="POST"?"Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.":"Não foi possível conectar à API. Verifique a conexão e tente novamente.",0,"NETWORK_ERROR");
  }
  if(!response.ok){
    const body=await response.json().catch(()=>({})) as {error?:string;message?:string;requestId?:string};
    if(response.status===401){
      const current=await supabase.auth.getSession();
      if(current.data.session?.access_token===data.session.access_token)await supabase.auth.signOut({scope:"local"});
      throw new ApiError("Sua sessão expirou. Entre novamente.",401,"SESSION_EXPIRED");
    }
    throw new ApiError(body.message || messages[body.error??""] || "Não foi possível concluir a operação.",response.status,body.error??"HTTP_ERROR",body.requestId);
  }
  return html?response.text():response.json();
}
async function json<T>(path:string,schema:z.ZodType<T>,options:RequestInit={}):Promise<T>{
  const body=await request(path,options);
  const result=schema.safeParse(body);
  if(!result.success)throw new ApiError("A API retornou dados em um formato inesperado.",502,"INVALID_RESPONSE");
  return result.data;
}
export const pageSize=25;
function storePath(storeId:string){return "/v1/stores/"+encodeURIComponent(storeId);}
function query(values:Record<string,string|number>){return "?"+new URLSearchParams(Object.entries(values).map(([key,value])=>[key,String(value)]));}
async function priceChangesForRun(storeId:string,syncRunId:string){
  const all: z.infer<typeof priceChangeSchema>[]=[];
  for(let offset=0;offset<=10_000;offset+=100){
    const page=await json(storePath(storeId)+"/price-changes"+query({syncRunId,limit:100,offset}),z.object({changes:z.array(priceChangeSchema),limit:z.number(),offset:z.number()}));
    all.push(...page.changes);
    if(page.changes.length<100)break;
  }
  return all;
}
export const service={
  me:(signal?:AbortSignal)=>json("/v1/me",identitySchema,signal?{signal}:{}),
  products:(storeId:string,q:string,offset:number,signal?:AbortSignal)=>json(storePath(storeId)+"/products"+query({...(q.trim()?{q:q.trim()}:{}),limit:pageSize,offset}),z.object({products:z.array(productSchema),limit:z.number(),offset:z.number()}),signal?{signal}:{}),
  importProductsCsv:(storeId:string,csv:string)=>json(storePath(storeId)+"/imports/products",importResultSchema,{method:"POST",headers:{"Content-Type":"text/csv"},body:csv}),
  priceChanges:priceChangesForRun,
  promotions:(storeId:string,status:string,offset:number,signal?:AbortSignal)=>json(storePath(storeId)+"/promotions"+query({...(status?{status}:{}),limit:pageSize,offset}),z.object({promotions:z.array(promotionSchema),limit:z.number(),offset:z.number()}),signal?{signal}:{}),
  createPromotion:(storeId:string,body:{productId:string;promotionalAmount:string;startsAt:string;endsAt:string})=>json(storePath(storeId)+"/promotions",z.object({promotion:z.object({id:z.string().uuid()})}),{method:"POST",body:JSON.stringify(body)}),
  cancelPromotion:(storeId:string,id:string)=>json(storePath(storeId)+"/promotions/"+encodeURIComponent(id)+"/cancel",z.object({status:z.literal("cancelled")}),{method:"POST"}),
  labels:(storeId:string,status:string,offset:number,signal?:AbortSignal)=>json(storePath(storeId)+"/labels"+query({...(status?{status}:{}),limit:pageSize,offset}),z.object({labels:z.array(labelSchema),limit:z.number(),offset:z.number()}),signal?{signal}:{}),
  createLabel:(storeId:string,productId:string,promotionId?:string)=>json(storePath(storeId)+"/labels",z.object({label:labelCoreSchema,productName:z.string(),unit:z.string()}),{method:"POST",body:JSON.stringify({productId,...(promotionId?{promotionId}:{})})}),
  validatePrint:(storeId:string,labelId:string)=>request(storePath(storeId)+"/labels/"+encodeURIComponent(labelId)+"/print?widthMm=100&heightMm=70",{},true),
  printed:(storeId:string,labelId:string)=>json(storePath(storeId)+"/labels/"+encodeURIComponent(labelId)+"/printed",z.object({label:z.object({id:z.string().uuid(),status:z.literal("printed")})}),{method:"POST"}),
  printBatch:(storeId:string,labelIds:string[])=>request(storePath(storeId)+"/labels/print-batch"+query({labelIds:labelIds.join(","),widthMm:210,heightMm:297}),{},true) as Promise<string>,
};

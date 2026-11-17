import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const storeSchema = z.object({id:z.string().uuid(),organizationId:z.string().uuid(),name:z.string().min(1)});
export type StoreConfig = z.infer<typeof storeSchema>;
export const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/,"");
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export let configurationError = "";
export let stores: StoreConfig[] = [];
try {
  stores=z.array(storeSchema).parse(JSON.parse(import.meta.env.VITE_STORES || "[]"));
} catch {
  configurationError="A configuração das lojas precisa ser revisada pelo responsável pelo sistema.";
}
function publicKey(value:string) {
  if(value.startsWith("sb_publishable_"))return true;
  try {return JSON.parse(atob(value.split(".")[1]!.replace(/-/g,"+").replace(/_/g,"/"))).role==="anon";}
  catch{return false;}
}
const validAuth = !!url && /^https?:\/\//.test(url) && !!key && publicKey(key);
export const supabase = validAuth ? createClient(url,key,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storage:window.sessionStorage},
}) : null;
export const authConfigured = !!supabase;

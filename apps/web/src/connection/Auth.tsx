import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { authConfigured, configurationError, stores, supabase, type StoreConfig } from "./config";
import { service } from "./service";
import type { Identity } from "./contracts";
import "./connection.css";

type Context = {
  session:Session|null;
  identity:Identity|undefined;
  store:StoreConfig|undefined;
  canManage:boolean;
  loading:boolean;
  error:Error|null;
  selectStore:(id:string)=>void;
  refresh:()=>void;
};
const AuthContext=createContext<Context|null>(null);
export function ConnectionProvider({children}:{children:ReactNode}){
  const [session,setSession]=useState<Session|null>(null);
  const [storeId,setStoreId]=useState("");
  const queryClient=useQueryClient();
  const previousUser=useRef<string|undefined>(undefined);
  useEffect(()=>{
    if(!supabase)return;
    const {data}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(previousUser.current!==next?.user.id){queryClient.clear();setStoreId("");previousUser.current=next?.user.id;}
      setSession(next);
    });
    return ()=>data.subscription.unsubscribe();
  },[queryClient]);
  const me=useQuery({queryKey:["me",session?.user.id],queryFn:({signal})=>service.me(signal),enabled:!!session,retry:false});
  const allowed=stores.filter((store)=>me.data?.organizations.some((organization)=>organization.organizationId===store.organizationId));
  const store=allowed.find((item)=>item.id===storeId)??allowed[0];
  const role=me.data?.organizations.find((item)=>item.organizationId===store?.organizationId)?.role;
  return <AuthContext.Provider value={{session,identity:me.data,store,canManage:role==="owner"||role==="manager",loading:!!session&&me.isPending,error:me.error,selectStore:setStoreId,refresh:()=>{void me.refetch();}}}>{children}</AuthContext.Provider>;
}
export function useConnection(){
  const context=useContext(AuthContext);
  if(!context)throw new Error("Conexão não inicializada.");
  return context;
}
export function AccountSummary(){
  const {session,store}=useConnection();
  return <div className="account-summary">
    <span>{store?.name??"Editor local"}</span>
    {session?<><small>{session.user.email}</small><button type="button" onClick={()=>void supabase?.auth.signOut({scope:"local"})}>Sair</button></>:<Link to="/configuracoes">Entrar na conta</Link>}
  </div>;
}
export function RequireStore({children}:{children:ReactNode}){
  const {session,store,loading,error,refresh}=useConnection();
  if(!session)return <div className="connection-empty"><h2>Entre para acessar os dados da loja</h2><p>Conecte sua conta para consultar produtos, promoções e cartazes registrados.</p><Link className="button" to="/configuracoes">Entrar na conta</Link></div>;
  if(loading)return <p role="status">Carregando acesso às lojas…</p>;
  if(error)return <div role="alert"><p>{error.message}</p><button className="button" onClick={refresh}>Tentar novamente</button></div>;
  if(!store)return <div className="connection-empty"><h2>Configure uma loja autorizada</h2><p>{configurationError||"O responsável pelo sistema precisa configurar a loja e sua organização para esta conta."}</p><Link to="/configuracoes" className="button">Ver conexão</Link></div>;
  return <>{children}</>;
}
export function Settings(){
  const {session,identity,store,selectStore,loading,error,refresh}=useConnection();
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const allowed=stores.filter((item)=>identity?.organizations.some((org)=>org.organizationId===item.organizationId));
  return <><header className="topbar">Conexão com a loja</header><main id="conteudo" className="connected-page"><h1>Conta e loja</h1>
    {!session?<form className="connection-form" onSubmit={async(event)=>{
      event.preventDefault();if(!supabase||busy)return;
      setBusy(true);setMessage("");
      try{
        const result=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(result.error)setMessage("Não foi possível entrar. Confira o e-mail, a senha e a conexão.");
        else setPassword("");
      }catch{setMessage("Não foi possível conectar ao serviço de autenticação.");}
      finally{setBusy(false);}
    }}>
      <h2>Entrar</h2>
      {!authConfigured&&<p role="status">A conexão com Supabase precisa ser configurada pelo responsável pelo sistema.</p>}
      <label htmlFor="login-email">E-mail</label><input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e)=>setEmail(e.target.value)} disabled={!authConfigured}/>
      <label htmlFor="login-password">Senha</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e)=>setPassword(e.target.value)} disabled={!authConfigured}/>
      {message&&<p role="alert">{message}</p>}
      <button className="button" disabled={busy||!authConfigured}>{busy?"Entrando…":"Entrar"}</button>
    </form>:<section className="connection-form">
      <h2>{session.user.email}</h2>
      {loading&&<p role="status">Verificando acesso…</p>}
      {error&&<div role="alert"><p>{error.message}</p><button className="tool-button" onClick={refresh}>Tentar novamente</button></div>}
      {identity&&<>
        <label htmlFor="selected-store">Loja</label>
        <select id="selected-store" value={store?.id??""} onChange={(e)=>selectStore(e.target.value)} disabled={!allowed.length}>
          {!allowed.length&&<option value="">Nenhuma loja configurada</option>}
          {allowed.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}
        </select>
        <p>{configurationError||(!allowed.length?"Solicite ao responsável a configuração de uma loja da sua organização.":"O acesso às operações é validado pelo servidor.")}</p>
      </>}
      <button className="tool-button" onClick={()=>void supabase?.auth.signOut({scope:"local"})}>Sair da conta</button>
    </section>}
    <p className="connection-footnote">A sessão permanece apenas nesta janela. Ao recarregar, entre novamente. Os rascunhos locais continuam neste navegador.</p>
  </main></>;
}

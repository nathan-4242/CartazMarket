import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Source } from "./contracts";
import { service } from "./service";
import { supabase } from "./config";
import { useConnection } from "./Auth";

export async function validateLinkedOutput(source:Source) {
  const {data}=supabase ? await supabase.auth.getSession() : {data:{session:null}};
  if(!data.session || data.session.user.id!==source.userId)throw new Error("Entre na conta que registrou este cartaz para validar a impressão.");
  await service.validatePrint(source.storeId,source.labelId);
}
export function RemoteLabel({source}:{source:Source}){
  const {session}=useConnection();
  const queryClient=useQueryClient();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  return <section className="remote-label">
    <div><strong>Cartaz registrado na loja</strong><p>Registro {source.labelId}. Produto, preço e validade seguem o registro do servidor. O desenho é salvo neste navegador.</p></div>
    {session?.user.id===source.userId?<button className="tool-button" type="button" disabled={busy} onClick={async()=>{
      if(!window.confirm("Confirma que este cartaz foi impresso com sucesso?"))return;
      setBusy(true);setMessage("");
      try{
        await service.printed(source.storeId,source.labelId);
        await queryClient.invalidateQueries({queryKey:["store",source.userId,source.storeId,"labels"]});
        setMessage("Impressão confirmada no servidor.");
      }catch(error){setMessage(error instanceof Error?error.message:"Não foi possível confirmar.");}
      finally{setBusy(false);}
    }}>Confirmar impressão</button>:<Link className="button" to="/configuracoes">Entrar para validar</Link>}
    {message&&<span role="status">{message}</span>}
  </section>;
}

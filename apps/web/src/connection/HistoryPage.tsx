import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { RequireStore, useConnection } from "./Auth";
import { decimalToBrazilian } from "./contracts";
import { alertNames, importNames } from "./historyContracts";
import { pageSize, service } from "./service";

type Section = "alerts" | "imports" | "price-history";
const titles = { alerts: "Alertas de retirada", imports: "Histórico de importações", "price-history": "Alterações de preços" };
const dateTime = (date: string) => new Date(date).toLocaleString("pt-BR");
const amount = (value: string) => "R$ " + decimalToBrazilian(value);
const localDate = (value: string, end = false) =>
  new Date(value + (end ? "T23:59:59.999" : "T00:00:00")).toISOString();

function HistoryList({ section, syncRunId }: { section: Section; syncRunId: string }) {
  const { store, session } = useConnection();
  const scope = ["store", session!.user.id, store!.id];
  const storeId = store!.id;
  const client = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const invalidRange = Boolean(from && to && from > to);
  const priceFilters = {
    ...(syncRunId ? { syncRunId } : {}),
    ...(from ? { from: localDate(from) } : {}),
    ...(to ? { to: localDate(to, true) } : {}),
  };
  const statusFilter: Record<string, string> = status ? { status } : {};
  const list = useQuery({
    queryKey: [...scope, section, status, from, to, syncRunId, offset],
    enabled: !invalidRange,
    retry: false,
    queryFn: async ({ signal }) => {
      if (section === "alerts") return { alerts: (await service.alerts(storeId, statusFilter, offset, signal)).alerts };
      if (section === "imports") return { imports: (await service.imports(storeId, statusFilter, offset, signal)).imports };
      return { changes: (await service.priceHistory(storeId, priceFilters, offset, signal)).changes };
    },
  });

  async function update(operation: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setActionError("");
    try {
      await operation();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    } finally {
      await client.invalidateQueries({ queryKey: scope });
      setPending(false);
    }
  }

  let headings: string[] = [];
  let rows: Array<{ id: string; cells: ReactNode[] }> = [];
  if (list.data?.alerts) {
    headings = ["Produto", "Preço do cartaz", "Prazo de retirada", "Status", "Ações"];
    rows = list.data.alerts.map((alert) => ({
      id: alert.id,
      cells: [alert.productName, amount(alert.displayAmount), dateTime(alert.removalDueAt ?? alert.createdAt),
        alertNames[alert.status], <div className="row-actions">
          {alert.status === "unread" && <button className="tool-button" disabled={pending}
            onClick={() => void update(() => service.readAlert(storeId, alert.id))}>Marcar como lido</button>}
          {alert.status !== "resolved" && <button className="tool-button" disabled={pending} onClick={() => {
            if (window.confirm("Confirma que o cartaz foi retirado da loja?")) {
              void update(() => service.removed(storeId, alert.labelId));
            }
          }}>Confirmar retirada</button>}
        </div>],
    }));
  } else if (list.data?.imports) {
    headings = ["Data", "Origem", "Status", "Linhas recebidas", "Preços alterados", "Detalhes"];
    rows = list.data.imports.map((run) => ({
      id: run.id,
      cells: [dateTime(run.createdAt), run.sourceSystem, importNames[run.status], run.rowsReceived, run.pricesChanged,
        run.status === "applied" ? <Link to={"/alteracoes-de-precos?importacao=" + run.id}>Ver mudanças de preço</Link> : run.errorSummary ?? "—"],
    }));
  } else if (list.data?.changes) {
    headings = ["Produto", "Preço anterior", "Preço novo", "Data"];
    rows = list.data.changes.map((change) => ({
      id: change.id,
      cells: [change.productName, change.oldAmount === null ? "—" : amount(change.oldAmount), amount(change.newAmount), dateTime(change.occurredAt)],
    }));
  }

  return <>
    <div className="data-toolbar">
      {section === "price-history" ? <>
        <label>De<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }}/></label>
        <label>Até<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }}/></label>
        {syncRunId && <Link to="/alteracoes-de-precos">Mostrar todas as importações</Link>}
      </> : <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}>
        <option value="">Todos</option>
        {Object.entries(section === "alerts" ? alertNames : importNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select></label>}
    </div>
    {actionError && <p className="api-error" role="alert">{actionError}</p>}
    {invalidRange ? <p role="alert">A data final deve ser igual ou posterior à inicial.</p>
      : list.isPending ? <p role="status">Carregando…</p>
      : list.error ? <div className="api-error" role="alert"><p>{list.error.message}</p><button className="tool-button" onClick={() => void list.refetch()}>Tentar novamente</button></div>
      : rows.length === 0 ? <p className="connection-empty">Nenhum registro encontrado.</p>
      : <div className="data-table-wrap"><table className="data-table">
        <thead><tr>{headings.map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td key={headings[index]}>{cell}</td>)}</tr>)}</tbody>
      </table></div>}
    <div className="pagination">
      <button className="tool-button" disabled={!offset || list.isFetching || pending} onClick={() => setOffset(offset - pageSize)}>Anterior</button>
      <span>Página {offset / pageSize + 1}</span>
      <button className="tool-button" disabled={invalidRange || list.isFetching || pending || rows.length < pageSize || offset >= 10000}
        onClick={() => setOffset(offset + pageSize)}>Próxima</button>
    </div>
  </>;
}

export function HistoryPage({ section }: { section: Section }) {
  const { store, session } = useConnection();
  const [params] = useSearchParams();
  const syncRunId = section === "price-history" ? params.get("importacao") ?? "" : "";
  return <>
    <header className="topbar">{titles[section]}<span className="status">{store?.name}</span></header>
    <main id="conteudo" className="connected-page">
      <h1>{titles[section]}</h1>
      <RequireStore><HistoryList key={[section, store?.id, session?.user.id, syncRunId].join(":")}
        section={section} syncRunId={syncRunId}/></RequireStore>
    </main>
  </>;
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectionProvider, Settings as ConnectionSettings, AccountSummary } from "./connection/Auth";
import { StorePage } from "./connection/StorePage";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import {
  Activity, ArrowLeft, Bell, CircleHelp, Clock3, LayoutDashboard, LayoutTemplate,
  LockKeyhole, Package, PencilRuler, Printer, RefreshCw, Settings, Store, Tag, Tags, TrendingUp,
} from "lucide-react";
import { checkConnection, type Connection } from "./api";
import "./styles.css";
import { Editor } from "./posters/Editor";

const modules = [
  { name: "Editor de Cartazes", icon: PencilRuler, phase: "Editor visual", path: "/editor" },
  { name: "Modelos", icon: LayoutTemplate, phase: "Editor visual", path: "/modelos" },
  { name: "Meus Cartazes", icon: Tags, phase: "Integração", path: "/cartazes" },
  { name: "Produtos", icon: Package, phase: "Integração", path: "/produtos" },
  { name: "Promoções", icon: Tag, phase: "Integração", path: "/promocoes" },
  { name: "Alterações de Preços", icon: TrendingUp, phase: "Operação comercial" },
  { name: "Impressão", icon: Printer, phase: "Impressão", path: "/impressao" },
  { name: "Histórico", icon: Clock3, phase: "Operação comercial" },
  { name: "Configurações", icon: Settings, phase: "Integração", path: "/configuracoes" },
];

const connectionLabels: Record<Connection, string> = {
  checking: "Verificando API",
  ready: "API conectada",
  "database-unavailable": "Banco indisponível",
  unavailable: "API indisponível",
};

const connectionDetails: Record<Connection, string> = {
  checking: "Aguardando resposta do serviço.",
  ready: "A API confirmou conexão com o banco de dados.",
  "database-unavailable": "A API respondeu que o banco de dados está indisponível.",
  unavailable: "Não foi possível verificar o serviço. Confira o endereço e se a API está em execução.",
};

function Dashboard() {
  const [connection, setConnection] = useState<Connection>("checking");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
    checkConnection(signal)
      .then((result) => {
        if (!controller.signal.aborted) setConnection(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnection("unavailable");
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <>
      <header className="topbar">
        <span>Dashboard</span>
        <span className="status" data-state={connection} role="status">
          <span className="dot" />{connectionLabels[connection]}
        </span>
        <button className="icon-button" type="button" aria-label="Notificações indisponíveis" disabled>
          <Bell size={19} />
        </button>
      </header>
      <main id="conteudo">
        <div className="intro">
          <h1>Visão geral</h1>
          <p>Seu espaço de trabalho para cartazes promocionais.</p>
        </div>

        <section className="connection" aria-labelledby="connection-title">
          <div className="connection-icon"><Activity size={23} /></div>
          <div>
            <h2 id="connection-title">Conexão com a API</h2>
            <p aria-live="polite">{connectionDetails[connection]}</p>
          </div>
          <button type="button" className="button" disabled={connection === "checking"} onClick={() => {
            setConnection("checking");
            setAttempt((previous) => previous + 1);
          }}>
            <RefreshCw size={16} /> Verificar conexão
          </button>
        </section>

        <section className="workspace" aria-labelledby="workspace-title">
          <div className="section-title">
            <h2 id="workspace-title">Área de trabalho</h2>
            <p>Crie e personalize um cartaz ou explore a galeria de modelos.</p>
          </div>
          <div className="module-grid">
            {modules.slice(0, -1).map(({ name, icon: Icon, phase, path }) => path ? (
              <Link className="module module-link" key={name} to={path}>
                <Icon className="module-icon" size={21} aria-hidden="true" />
                <div><h3>{name}</h3><p>{path === "/editor" ? "Criar cartaz" : path === "/impressao" ? "Exportar ou imprimir" : path === "/modelos" ? "Comparar seis modelos" : "Consultar dados da loja"}</p></div>
              </Link>
            ) : (
              <article className="module" key={name}>
                <Icon className="module-icon" size={21} aria-hidden="true" />
                <div><h3>{name}</h3><p>{phase}</p></div>
                <LockKeyhole className="lock" size={15} aria-hidden="true" />
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function App() {
  return (
    <div className="shell">
      <a className="skip" href="#conteudo">Pular para o conteúdo</a>
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-icon"><Tag size={21} aria-hidden="true" /></span>
          Cartaz<span className="brand-accent">Market</span>
        </Link>
        <nav aria-label="Menu principal">
          <NavLink className="nav-link" end to="/">
            <LayoutDashboard size={18} />Dashboard
          </NavLink>
          {modules.map(({ name, icon: Icon, path }) => path ? (
            <NavLink className="nav-link" key={name} to={path}>
              <Icon size={18} aria-hidden="true" />{name}
            </NavLink>
          ) : (
            <span className="nav-link" key={name} aria-disabled="true">
              <Icon size={18} aria-hidden="true" />{name}
              <LockKeyhole className="nav-lock" size={13} aria-hidden="true" />
            </span>
          ))}
        </nav>
        <AccountSummary/>
      </aside>
      <div className="body">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="configuracoes" element={<ConnectionSettings/>}/>
          <Route path="produtos" element={<StorePage section="products"/>}/>
          <Route path="promocoes" element={<StorePage section="promotions"/>}/>
          <Route path="cartazes" element={<StorePage section="labels"/>}/>
          <Route path="editor" element={<Editor key="editor" />} />
          <Route path="impressao" element={<Editor key="impressao" printing />} />
          <Route path="modelos" element={<Editor key="modelos" gallery />} />
          <Route path="*" element={
            <main id="conteudo">
              <div className="intro">
                <CircleHelp size={25} aria-hidden="true" />
                <h1>Página não encontrada</h1>
                <Link className="button back" to="/"><ArrowLeft size={16} />Voltar ao dashboard</Link>
              </div>
            </main>
          } />
        </Routes>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><ConnectionProvider><App /></ConnectionProvider></BrowserRouter></QueryClientProvider></StrictMode>,
);

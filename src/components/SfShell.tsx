import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { APP_VERSION } from "../lib/version";
import { useState } from "react";
import { resetPlaygroundData } from "@/lib/crud";

const TABS: Array<{ label: string; to: string }> = [
  { label: "Início", to: "/" },
  { label: "Contas", to: "/accounts" },
  { label: "Contatos", to: "/contacts" },
  { label: "Oportunidades", to: "/opportunities" },
];

export function SfShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const path = location.pathname;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const isActive = (to: string) => {
    if (to === "/") return path === "/";
    return path === to || path.startsWith(to + "/");
  };

  return (
    <div className="sf-app">
      <header className="sf-global-header">
        <div className="sf-gh-left">
          <div className="sf-cloud-logo" aria-hidden></div>
          <span className="sf-gh-title">CRM</span>
          <span className="sf-gh-version" title="Versão do aplicativo">{APP_VERSION}</span>
        </div>
        <div className="sf-gh-search">
          <input className="sf-search-input" placeholder="Pesquisar" />
        </div>
        <div className="sf-gh-right">
          <button className="sf-btn" onClick={() => setSettingsOpen(true)}>Configurações</button>
          <button className="sf-icon-btn" title="Notificações"></button>
          <div className="sf-avatar" title="Usuário">
            US
          </div>
        </div>
      </header>

      <nav className="sf-context-bar">
        <div className="sf-app-launcher">
          <span className="sf-grid-icon"></span>
          <span className="sf-app-name">Vendas</span>
        </div>
        <ul className="sf-nav-tabs">
          {TABS.map((t) => (
            <li key={t.to} className={`sf-nav-tab ${isActive(t.to) ? "sf-nav-tab--active" : ""}`}>
              <Link to={t.to}>{t.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
      {settingsOpen && (
        <div className="sf-modal-backdrop" onClick={() => !resetBusy && setSettingsOpen(false)}>
          <section className="sf-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="sf-modal-header"><h2 id="settings-title">Configurações do playground</h2><button className="sf-btn" onClick={() => setSettingsOpen(false)}>Fechar</button></div>
            <div className="sf-modal-body">
              <p>Gerencie os dados de demonstração do app.</p>
              <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
                <button className="sf-btn" disabled={resetBusy} onClick={async () => {
                  if (!confirm("Isso excluirá todos os registros de todos os objetos. Esta ação não pode ser desfeita. Continuar?")) return;
                  setResetBusy(true);
                  try { await resetPlaygroundData({ data: { mode: "clear" } }); window.location.reload(); }
                  catch (error) { alert(error instanceof Error ? error.message : "Não foi possível limpar os dados."); setResetBusy(false); }
                }}>{resetBusy ? "Processando…" : "Resetar dados de todos os objetos"}</button>
                <button className="sf-btn sf-btn--brand" disabled={resetBusy} onClick={async () => {
                  if (!confirm("Isso excluirá os dados atuais e restaurará a base de demonstração original do playground. Continuar?")) return;
                  setResetBusy(true);
                  try { await resetPlaygroundData({ data: { mode: "factory" } }); window.location.reload(); }
                  catch (error) { alert(error instanceof Error ? error.message : "Não foi possível restaurar os dados."); setResetBusy(false); }
                }}>{resetBusy ? "Processando…" : "Factory reset do playground"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

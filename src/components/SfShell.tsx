import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { APP_VERSION } from "../lib/version";

const TABS: Array<{ label: string; to: string }> = [
  { label: "Início", to: "/" },
  { label: "Contas", to: "/accounts" },
  { label: "Contatos", to: "/contacts" },
];

export function SfShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const path = location.pathname;

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
          <button className="sf-icon-btn" title="Configuração"></button>
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
    </div>
  );
}

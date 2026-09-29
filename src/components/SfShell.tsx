import { Link, useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { APP_VERSION } from "../lib/version";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getAppSettings,
  resetPlaygroundData,
  setActiveProfile,
  updateAlcadaThresholds,
} from "@/lib/crud";

const TABS: Array<{ label: string; to: string }> = [
  { label: "Início", to: "/" },
  { label: "Aprovação", to: "/approvals" },
  { label: "Contas", to: "/accounts" },
  { label: "Contatos", to: "/contacts" },
  { label: "Oportunidades", to: "/opportunities" },
  { label: "Cotações", to: "/quotes" },
  { label: "Itens", to: "/quote-line-items" },
  { label: "Agendas", to: "/quote-schedules" },
  { label: "Fluxos", to: "/planned-flows" },
  { label: "Locations", to: "/locations" },
  { label: "Mercadorias", to: "/merchandise" },
  { label: "Bases Diesel", to: "/diesel-bases" },
  { label: "Preços Recomendados", to: "/recommended-prices" },
];

export function SfShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const path = location.pathname;
  const qc = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [ggPct, setGgPct] = useState("5");
  const [dirPct, setDirPct] = useState("7");
  const { data: settings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: () => getAppSettings() as Promise<any>,
  });
  const activeProfile = settings?.activeProfile ?? "sales";
  const isApprover = activeProfile === "approver";
  const thresholds = settings?.thresholds;
  useEffect(() => {
    if (thresholds) {
      setGgPct(String(thresholds.gg));
      setDirPct(String(thresholds.dir));
    }
  }, [thresholds?.gg, thresholds?.dir]);

  const isActive = (to: string) => {
    if (to === "/") return path === "/";
    return path === to || path.startsWith(to + "/");
  };
  // A fila fica disponível apenas no perfil simulado de Aprovador.
  const visibleTabs = isApprover ? TABS : TABS.filter((t) => t.to !== "/approvals");

  return (
    <div className="sf-app">
      <header className="sf-global-header">
        <div className="sf-gh-left">
          <div className="sf-cloud-logo" aria-hidden></div>
          <span className="sf-gh-title">CRM</span>
          <span className="sf-gh-version" title="Versão do aplicativo">
            {APP_VERSION}
          </span>
        </div>
        <div className="sf-gh-search">
          <input className="sf-search-input" placeholder="Pesquisar" />
        </div>
        <div className="sf-gh-right">
          <span className="sf-gh-approver" title="Perfil ativo da simulação">
            Perfil: {isApprover ? "Aprovador" : "Vendas"}
          </span>
          <button className="sf-btn" onClick={() => setSettingsOpen(true)}>
            Configurações
          </button>
          <button className="sf-icon-btn" title="Notificações"></button>
          <div className="sf-avatar" title="Usuário">
            US
          </div>
        </div>
      </header>

      <nav className="sf-context-bar">
        <div className="sf-app-launcher">
          <span className="sf-grid-icon"></span>
          <span className="sf-app-name">{isApprover ? "Aprovador" : "Vendas"}</span>
        </div>
        <ul className="sf-nav-tabs">
          {visibleTabs.map((t) => (
            <li key={t.to} className={`sf-nav-tab ${isActive(t.to) ? "sf-nav-tab--active" : ""}`}>
              <Link to={t.to}>{t.label}</Link>
            </li>
          ))}
        </ul>
      </nav>

      {children}
      {settingsOpen && (
        <div className="sf-modal-backdrop" onClick={() => !resetBusy && setSettingsOpen(false)}>
          <section
            className="sf-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sf-modal-header">
              <h2 id="settings-title">Configurações do playground</h2>
              <button className="sf-btn" onClick={() => setSettingsOpen(false)}>
                Fechar
              </button>
            </div>
            <div className="sf-modal-body">
              <p>Gerencie os dados de demonstração do app.</p>
              <div style={{ marginTop: 20 }}>
                <strong>Perfil de acesso</strong>
                <p style={{ fontSize: 12, color: "#706e6b", margin: "4px 0 8px" }}>
                  Esta é uma simulação com dois perfis: Vendas prepara as Cotações; Aprovador pode
                  aprovar ou rejeitar qualquer solicitação pendente. Não há usuários ou níveis.
                </p>
                <select
                  className="sf-input"
                  value={activeProfile}
                  disabled={resetBusy}
                  style={{ width: "100%", padding: 8 }}
                  onChange={async (event) => {
                    const profile = event.target.value;
                    try {
                      await setActiveProfile({ data: { profile } });
                      await qc.invalidateQueries({ queryKey: ["app-settings"] });
                      await qc.invalidateQueries({ queryKey: ["approvals"] });
                      toast.success(
                        profile === "approver"
                          ? "Perfil Aprovador ativado."
                          : "Perfil Vendas ativado.",
                      );
                    } catch (error) {
                      toast.error("Não foi possível trocar o perfil", {
                        description: error instanceof Error ? error.message : undefined,
                      });
                    }
                  }}
                >
                  <option value="sales">Perfil Vendas</option>
                  <option value="approver">Perfil Aprovador</option>
                </select>
              </div>
              <div style={{ marginTop: 20 }}>
                <strong>Limites de preço</strong>
                <p style={{ fontSize: 12, color: "#706e6b", margin: "4px 0 8px" }}>
                  Até o primeiro limite não é necessária aprovação. Acima dele, qualquer solicitação
                  pode ser decidida pelo Perfil Aprovador. O segundo limite apenas marca gravidade
                  alta; não cria outro nível de aprovador.
                </p>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: 12 }}>
                    Sem aprovação até (%)
                    <input
                      className="sf-input"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={ggPct}
                      onChange={(event) => setGgPct(event.target.value)}
                      style={{ marginLeft: 6, padding: 6, width: 90 }}
                    />
                  </label>
                  <label style={{ fontSize: 12 }}>
                    Gravidade alta acima de (%)
                    <input
                      className="sf-input"
                      type="number"
                      min={0.2}
                      step={0.1}
                      value={dirPct}
                      onChange={(event) => setDirPct(event.target.value)}
                      style={{ marginLeft: 6, padding: 6, width: 90 }}
                    />
                  </label>
                  <button
                    className="sf-btn"
                    disabled={resetBusy}
                    onClick={async () => {
                      try {
                        await updateAlcadaThresholds({
                          data: { gg: Number(ggPct), dir: Number(dirPct) },
                        });
                        await qc.invalidateQueries({ queryKey: ["app-settings"] });
                        toast.success("Limites de preço atualizados.");
                      } catch (error) {
                        toast.error("Não foi possível atualizar os limites", {
                          description: error instanceof Error ? error.message : undefined,
                        });
                      }
                    }}
                  >
                    Salvar limiares
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
                <button
                  className="sf-btn"
                  disabled={resetBusy}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Isso excluirá todos os registros de todos os objetos. Esta ação não pode ser desfeita. Continuar?",
                      )
                    )
                      return;
                    setResetBusy(true);
                    try {
                      await resetPlaygroundData({ data: { mode: "clear" } });
                      window.location.reload();
                    } catch (error) {
                      alert(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível limpar os dados.",
                      );
                      setResetBusy(false);
                    }
                  }}
                >
                  {resetBusy ? "Processando…" : "Resetar dados de todos os objetos"}
                </button>
                <button
                  className="sf-btn sf-btn--brand"
                  disabled={resetBusy}
                  onClick={async () => {
                    if (
                      !confirm(
                        "Isso excluirá os dados atuais e restaurará a base de demonstração original do playground. Continuar?",
                      )
                    )
                      return;
                    setResetBusy(true);
                    try {
                      await resetPlaygroundData({ data: { mode: "factory" } });
                      window.location.reload();
                    } catch (error) {
                      alert(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível restaurar os dados.",
                      );
                      setResetBusy(false);
                    }
                  }}
                >
                  {resetBusy ? "Processando…" : "Factory reset do playground"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

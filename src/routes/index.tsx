import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { homeDashboard } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Início | CRM" },
      { name: "description", content: "Painel inicial do CRM com contas e contatos." },
      { property: "og:title", content: "Início | CRM" },
      { property: "og:description", content: "Painel inicial do CRM com contas e contatos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

type Account = {
  id: string;
  name: string;
  health: string;
  risk_level: string;
  lifetime_value: number;
  account_owner: string | null;
};

function HomePage() {
  const { data } = useQuery({
    queryKey: ["home-dashboard"],
    queryFn: async () => {
      return await homeDashboard();
    },
  });

  const accounts = data?.accounts ?? [];
  const ltvTotal = accounts.reduce((s, a) => s + Number(a.lifetime_value ?? 0), 0);
  const atRisk = accounts.filter((a) => a.risk_level === "Alto").length;

  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Console de Vendas</div>
          <h1 className="sf-ph-title">Início</h1>
          <div className="sf-ph-sub">Visão geral das suas contas e contatos.</div>
        </div>
      </div>

      <div
        style={{
          padding: "16px 24px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
        }}
      >
        <Kpi label="Contas" value={String(accounts.length)} accent="#0176d3" />
        <Kpi label="Contatos" value={String(data?.contactCount ?? 0)} accent="#2e844a" />
        <Kpi label="Valor total (LTV)" value={fmtMoney(ltvTotal)} accent="#fe9339" />
        <Kpi label="Contas em risco" value={String(atRisk)} accent="#ea001e" />
      </div>

      <div style={{ padding: "0 24px 32px" }}>
        <div className="sf-card">
          <div
            className="sf-card-header"
            style={{ display: "flex", justifyContent: "space-between" }}
          >
            <span>Principais contas por valor de vida</span>
            <Link to="/accounts" className="sf-btn">
              Ver todas
            </Link>
          </div>
          <table className="sf-table">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Responsável</th>
                <th>Saúde</th>
                <th style={{ textAlign: "right" }}>LTV</th>
              </tr>
            </thead>
            <tbody>
              {accounts.slice(0, 6).map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to="/accounts/$id" params={{ id: a.id }} style={{ color: "#0176d3" }}>
                      {a.name}
                    </Link>
                  </td>
                  <td>{a.account_owner ?? "—"}</td>
                  <td>{a.health}</td>
                  <td style={{ textAlign: "right" }}>{fmtMoney(Number(a.lifetime_value))}</td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, color: "#706e6b", textAlign: "center" }}>
                    Nenhuma conta cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </SfShell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="sf-card" style={{ padding: 16 }}>
      <div
        style={{ fontSize: 12, color: "#706e6b", textTransform: "uppercase", letterSpacing: 0.5 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#181818", marginTop: 6 }}>{value}</div>
      <div style={{ height: 3, width: 36, background: accent, marginTop: 8, borderRadius: 2 }} />
    </div>
  );
}

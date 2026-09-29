import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { decideQuoteApproval, listApprovals } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { BusinessRulesChecklist } from "@/components/BusinessRulesChecklist";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/approvals/")({
  head: () => ({ meta: [{ title: "Aprovação | CRM" }] }),
  component: ApprovalsPage,
});

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "Aprovada"
      ? "#2e844a"
      : status === "Rejeitada"
        ? "#ba0517"
        : status === "Cancelada"
          ? "#706e6b"
          : "#fe9339";
  return (
    <span
      style={{
        color,
        border: `1px solid ${color}`,
        borderRadius: 12,
        padding: "1px 8px",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

function ApprovalsPage() {
  const qc = useQueryClient();
  const [deciding, setDeciding] = useState<any>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["approvals"],
    queryFn: () => listApprovals() as Promise<any>,
  });
  const pending = data?.pending ?? [];
  const decided = data?.decided ?? [];
  const activeProfile = data?.activeProfile ?? "sales";
  const isApprover = activeProfile === "approver";
  const thresholds = data?.thresholds ?? { gg: 5, dir: 7 };

  async function decide(decision: "Aprovada" | "Rejeitada") {
    if (!deciding) return;
    setBusy(true);
    try {
      await decideQuoteApproval({
        data: { id: deciding.id, decision, note: note || undefined },
      });
      toast.success(
        decision === "Aprovada"
          ? "Solicitação aprovada. A Cotação pode seguir para conclusão."
          : "Solicitação rejeitada. Ajuste os preços e valide novamente.",
      );
      setDeciding(null);
      setNote("");
      await qc.invalidateQueries({ queryKey: ["approvals"] });
      await qc.invalidateQueries({ queryKey: ["home-dashboard"] });
      await qc.invalidateQueries({ queryKey: ["quote-full"] });
    } catch (error) {
      toast.error("Não foi possível registrar a decisão", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  const rules = [
    {
      label: "Perfil de acesso",
      passed: isApprover,
      detail: isApprover ? "Perfil Aprovador ativo" : "Ative o Perfil Aprovador em Configurações",
      explanation:
        "Este playground é uma simulação sem usuários individuais: o Perfil Vendas prepara Cotações e o Perfil Aprovador pode decidir qualquer solicitação pendente.",
    },
    {
      label: "Limites de preço configurados",
      passed: thresholds.gg > 0 && thresholds.dir > thresholds.gg,
      detail: `Sem aprovação até ${thresholds.gg}% · gravidade alta acima de ${thresholds.dir}%`,
      explanation:
        "Acima do primeiro limite, a Cotação inteira entra na fila. O segundo limite só diferencia a gravidade visual; não restringe o Perfil Aprovador.",
    },
  ];

  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Solicitações de aprovação</div>
          <h1 className="sf-ph-title">Aprovação</h1>
          <div className="sf-ph-sub">
            Fila de Cotações que precisam de uma decisão do Perfil Aprovador.
          </div>
        </div>
      </div>
      <div style={{ padding: "0 24px 32px", display: "grid", gap: 16 }}>
        {isApprover ? (
          <div
            className="sf-card"
            style={{ padding: 14, display: "flex", gap: 10, alignItems: "center" }}
          >
            <span style={{ color: "#2e844a", fontWeight: 600 }}>✓ Perfil Aprovador ativo</span>
            <span style={{ color: "#706e6b", fontSize: 12 }}>
              Este perfil pode aprovar ou rejeitar qualquer solicitação pendente.
            </span>
          </div>
        ) : (
          <div className="sf-card" style={{ padding: 14, color: "#ba0517" }}>
            ⚠ Ative o <strong>Perfil Aprovador</strong> em Configurações para decidir solicitações.
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <Kpi label="Pendentes" value={String(pending.length)} accent="#fe9339" />
          <Kpi
            label="Aprovadas (histórico)"
            value={String(decided.filter((row: any) => row.status === "Aprovada").length)}
            accent="#2e844a"
          />
          <Kpi
            label="Rejeitadas (histórico)"
            value={String(decided.filter((row: any) => row.status === "Rejeitada").length)}
            accent="#ea001e"
          />
        </div>

        <div className="sf-card">
          <div className="sf-card-header">
            <span>Solicitações pendentes</span>
          </div>
          <table className="sf-table">
            <thead>
              <tr>
                <th>Cotação</th>
                <th>Conta</th>
                <th>Oportunidade</th>
                <th>Desvio máx.</th>
                <th>Solicitada em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row: any) => (
                <tr key={row.id}>
                  <td>
                    <Link to="/quotes/$id" params={{ id: row.quote_id }}>
                      {row.quote_number}
                    </Link>
                  </td>
                  <td>{row.account_name}</td>
                  <td>
                    <Link to="/opportunities/$id" params={{ id: row.opportunity_id }}>
                      {row.opportunity_name}
                    </Link>
                  </td>
                  <td>{Number(row.max_discount_pct).toFixed(2)}%</td>
                  <td>{fmtDate(row.requested_at)}</td>
                  <td>
                    <button
                      className="sf-btn sf-btn--brand"
                      disabled={!row.can_decide}
                      title={
                        row.can_decide
                          ? "Aprova a alçada e libera a Cotação para conclusão"
                          : "Ative o Perfil Aprovador em Configurações para decidir"
                      }
                      onClick={() => {
                        setDeciding({ ...row, action: "Aprovada" });
                        setNote("");
                      }}
                    >
                      Aprovar
                    </button>{" "}
                    <button
                      className="sf-btn"
                      disabled={!row.can_decide}
                      title={
                        row.can_decide
                          ? "Rejeita a alçada; os preços precisam ser ajustados"
                          : "Ative o Perfil Aprovador em Configurações para decidir"
                      }
                      onClick={() => {
                        setDeciding({ ...row, action: "Rejeitada" });
                        setNote("");
                      }}
                    >
                      Rejeitar
                    </button>
                  </td>
                </tr>
              ))}
              {!pending.length && (
                <tr>
                  <td colSpan={6} style={{ color: "#706e6b" }}>
                    Nenhuma solicitação pendente. Cotações com desvio acima de {thresholds.gg}%
                    aparecem aqui automaticamente ao concluir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="sf-card">
          <div className="sf-card-header">
            <span>Histórico de decisões</span>
          </div>
          <table className="sf-table">
            <thead>
              <tr>
                <th>Cotação</th>
                <th>Desvio máx.</th>
                <th>Status</th>
                <th>Perfil</th>
                <th>Em</th>
                <th>Comentário</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((row: any) => (
                <tr key={row.id}>
                  <td>
                    <Link to="/quotes/$id" params={{ id: row.quote_id }}>
                      {row.quote_number}
                    </Link>
                  </td>
                  <td>{Number(row.max_discount_pct).toFixed(2)}%</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{row.decided_by_name ?? "Perfil Aprovador"}</td>
                  <td>{fmtDate(row.decided_at)}</td>
                  <td>{row.decision_note ?? "—"}</td>
                </tr>
              ))}
              {!decided.length && (
                <tr>
                  <td colSpan={6} style={{ color: "#706e6b" }}>
                    Nenhuma decisão registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <BusinessRulesChecklist
          title="Regras da aprovação"
          description="Como o Perfil Aprovador decide nesta simulação."
          rules={rules}
        />
      </div>

      {deciding && (
        <div className="sf-modal-backdrop" onClick={() => !busy && setDeciding(null)}>
          <section
            className="sf-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{ maxWidth: 480 }}
          >
            <div className="sf-modal-header">
              <h2>{deciding.action === "Aprovada" ? "Aprovar Cotação" : "Rejeitar Cotação"}</h2>
              <button className="sf-btn" disabled={busy} onClick={() => setDeciding(null)}>
                Fechar
              </button>
            </div>
            <div className="sf-modal-body">
              <p>
                Cotação <strong>{deciding.quote_number}</strong> · {deciding.account_name} · desvio máx.{" "}
                <strong>{Number(deciding.max_discount_pct).toFixed(2)}%</strong>
              </p>
              <p style={{ fontSize: 12, color: "#706e6b" }}>
                {deciding.action === "Aprovada"
                  ? "A aprovação libera a Cotação para conclusão e sincronização, mantendo os preços negociados."
                  : "A rejeição mantém a Cotação bloqueada; os preços devem ser ajustados e revalidados."}
              </p>
              <label style={{ fontSize: 12, display: "grid", gap: 4, marginTop: 8 }}>
                Comentário (opcional)
                <textarea
                  className="sf-input"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Justificativa da decisão"
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button className="sf-btn" disabled={busy} onClick={() => setDeciding(null)}>
                  Cancelar
                </button>
                <button
                  className={deciding.action === "Aprovada" ? "sf-btn sf-btn--brand" : "sf-btn"}
                  disabled={busy}
                  onClick={() => decide(deciding.action)}
                >
                  {busy ? "Registrando…" : `Confirmar ${deciding.action.toLowerCase()}`}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </SfShell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="sf-card"
      style={{
        padding: 14,
        borderLeft: `4px solid ${accent}`,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#706e6b" }}>{label}</div>
    </div>
  );
}

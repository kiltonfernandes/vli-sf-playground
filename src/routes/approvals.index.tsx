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
  const approver = data?.currentApprover ?? null;
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
          ? `Alçada aprovada por ${approver?.name ?? ""}. A Cotação pode ser concluída.`
          : "Alçada rejeitada. Ajuste os preços da Cotação e valide novamente.",
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
      label: "Aprovador logado",
      passed: !!approver,
      detail: approver ? `${approver.name} · ${approver.level}` : "Nenhum aprovador logado",
      explanation:
        "Para decidir alçadas, logue como aprovador em Configurações. Aprovar ou rejeitar é registrado com o nome do aprovador, a data e o comentário, imitando o processo padrão do Salesforce.",
    },
    {
      label: "Nível do aprovador cobre as pendências",
      passed:
        !!approver &&
        pending.every(
          (row: any) => approver.level === "Diretoria" || approver.level === row.alcada_level,
        ),
      detail: pending.length
        ? `${pending.filter((row: any) => approver && (approver.level === "Diretoria" || approver.level === row.alcada_level)).length} de ${pending.length} pendências podem ser decididas`
        : "Sem pendências no momento",
      explanation:
        "A Diretoria pode decidir qualquer alçada. O Gerente Geral decide apenas solicitações de Gerente Geral — pendências de Diretoria continuam bloqueadas para ele.",
    },
    {
      label: "Limiares de alçada configurados",
      passed: thresholds.gg > 0 && thresholds.dir > thresholds.gg,
      detail: `Sem alçada até ${thresholds.gg}% · Gerente Geral até ${thresholds.dir}% · Diretoria acima`,
      explanation:
        "O desvio de preço é medido por Item contra o preço recomendado (Jetsons). Até o limite configurado a Cotação dispensa aprovação; acima dele a Cotação inteira fica na fila com a alçada do maior desvio. Ajuste os valores em Configurações.",
    },
  ];

  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Alçadas de Cotação</div>
          <h1 className="sf-ph-title">Aprovação</h1>
          <div className="sf-ph-sub">
            Fila de cotações com desvio de preço acima do limite, no fluxo padrão de aprovação.
          </div>
        </div>
      </div>
      <div style={{ padding: "0 24px 32px", display: "grid", gap: 16 }}>
        {approver ? (
          <div
            className="sf-card"
            style={{ padding: 14, display: "flex", gap: 10, alignItems: "center" }}
          >
            <span style={{ color: "#2e844a", fontWeight: 600 }}>✓ Aprovador logado</span>
            <span>
              {approver.name} · {approver.level}
            </span>
            <span style={{ color: "#706e6b", fontSize: 12 }}>
              Logue como outro aprovador em Configurações.
            </span>
          </div>
        ) : (
          <div className="sf-card" style={{ padding: 14, color: "#ba0517" }}>
            ⚠ Você não está logado como aprovador. Abra <strong>Configurações</strong> e escolha um
            aprovador para decidir alçadas. A Diretoria aprova qualquer nível; o Gerente Geral
            aprova apenas alçadas de Gerente Geral.
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
                <th>Alçada exigida</th>
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
                  <td>{row.alcada_level}</td>
                  <td>{Number(row.max_discount_pct).toFixed(2)}%</td>
                  <td>{fmtDate(row.requested_at)}</td>
                  <td>
                    <button
                      className="sf-btn sf-btn--brand"
                      disabled={!row.can_decide}
                      title={
                        row.can_decide
                          ? "Aprova a alçada e libera a Cotação para conclusão"
                          : `Requer aprovador ${row.alcada_level === "Diretoria" ? "da Diretoria" : "de Gerente Geral ou Diretoria"}`
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
                          : `Requer aprovador ${row.alcada_level === "Diretoria" ? "da Diretoria" : "de Gerente Geral ou Diretoria"}`
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
                  <td colSpan={7} style={{ color: "#706e6b" }}>
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
                <th>Alçada</th>
                <th>Desvio máx.</th>
                <th>Status</th>
                <th>Decidida por</th>
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
                  <td>{row.alcada_level}</td>
                  <td>{Number(row.max_discount_pct).toFixed(2)}%</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{row.decided_by_name ?? "—"}</td>
                  <td>{fmtDate(row.decided_at)}</td>
                  <td>{row.decision_note ?? "—"}</td>
                </tr>
              ))}
              {!decided.length && (
                <tr>
                  <td colSpan={7} style={{ color: "#706e6b" }}>
                    Nenhuma decisão registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <BusinessRulesChecklist
          title="Regras da aprovação de alçada"
          description="Como a fila de Aprovação funciona neste playground."
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
              <h2>{deciding.action === "Aprovada" ? "Aprovar alçada" : "Rejeitar alçada"}</h2>
              <button className="sf-btn" disabled={busy} onClick={() => setDeciding(null)}>
                Fechar
              </button>
            </div>
            <div className="sf-modal-body">
              <p>
                Cotação <strong>{deciding.quote_number}</strong> · {deciding.account_name} · alçada{" "}
                <strong>{deciding.alcada_level}</strong> · desvio máx.{" "}
                <strong>{Number(deciding.max_discount_pct).toFixed(2)}%</strong>
              </p>
              <p style={{ fontSize: 12, color: "#706e6b" }}>
                {deciding.action === "Aprovada"
                  ? "Aprovar libera a Cotação para conclusão e sincronização, mantendo os preços negociados."
                  : "Rejeitar mantém a Cotação bloqueada; os preços devem ser ajustados e revalidados."}
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

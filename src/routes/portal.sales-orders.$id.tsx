import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { approveSalesOrderInPortal, getPostContractDocument } from "@/lib/crud";
import { fmtDate, fmtMoney } from "@/lib/format";
import { SALES_ORDER, SALES_ORDER_STATUS, daysUntil, periodLabel } from "@/lib/post-contract";

export const Route = createFileRoute("/portal/sales-orders/$id")({
  head: () => ({
    meta: [
      { title: "Portal do Cliente · Ordem de vendas | VLI" },
      { name: "description", content: "Aprovação da ordem de vendas pelo cliente (portal simulado)." },
    ],
  }),
  component: CustomerPortalSalesOrder,
});

const fmtVolume = (value: unknown) => Number(value ?? 0).toLocaleString("pt-BR");
const fmtTariff = (value: unknown) =>
  Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

/** Portal do cliente (Experience Cloud simulado): Gestão de Contratos → Ordem de vendas. */
function CustomerPortalSalesOrder() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["post-contract-document", id],
    queryFn: () => getPostContractDocument({ data: { id } }),
  });
  const doc = (data?.document ?? {}) as Record<string, any>;
  const status = String(data?.status ?? "");
  const approved = status === SALES_ORDER_STATUS.approved;
  const expired = status === SALES_ORDER_STATUS.expired;
  const days = daysUntil(doc.expiresAt);
  const usesCbs = String(doc.commercialConditions?.tariffBasis ?? "").toLowerCase() === "cbs";
  const approve = async () => {
    setBusy(true);
    try {
      await approveSalesOrderInPortal({ data: { id } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["post-contract-document", id] }),
        qc.invalidateQueries({ queryKey: ["opportunity-full"] }),
      ]);
      toast.success("Ordem de vendas aprovada", { description: "A VLI foi notificada." });
    } catch (error) {
      toast.error("Não foi possível aprovar", { description: error instanceof Error ? error.message : undefined });
      await qc.invalidateQueries({ queryKey: ["post-contract-document", id] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sf-portal">
      <header className="sf-portal-header">
        <div className="sf-portal-brand">
          <span className="sf-portal-logo">VLI</span>
          <span>Portal do Cliente</span>
        </div>
        <nav className="sf-portal-nav" aria-label="Portal">
          <span>Início</span>
          <span className="is-active">Gestão de Contratos</span>
          <span>Faturas</span>
        </nav>
        <span className="sf-portal-user">{doc.contact?.name ?? "Cliente"}</span>
      </header>
      <div className="sf-portal-sim">Simulação do portal Experience Cloud · Playground VLI</div>
      <main className="sf-portal-main">
        <div className="sf-portal-crumb">Gestão de Contratos › Ordem de vendas</div>
        {isLoading ? (
          <p>Carregando…</p>
        ) : !data || data.kind !== SALES_ORDER ? (
          <p>Ordem de vendas não encontrada.</p>
        ) : (
          <>
            <section className={"sf-portal-hero" + (approved ? " is-approved" : expired ? " is-expired" : "")}>
              <div>
                <div className="sf-portal-eyebrow">Ordem de vendas Nº {data.netlex_number}</div>
                <h1>
                  {approved ? "Ordem aprovada. Obrigado!" : expired ? "Esta proposta expirou" : "Sua aprovação é necessária"}
                </h1>
                <p>
                  {approved
                    ? `Aprovada em ${fmtDate(doc.approvedAt)} por ${doc.approvedBy ?? doc.contact?.name ?? "você"}.`
                    : expired
                      ? `O prazo terminou em ${fmtDate(doc.expiresAt)}. Fale com seu gerente de contas VLI para receber uma nova proposta.`
                      : `Referente ao contrato Nº ${doc.baseContract?.netlexNumber ?? "—"}. Disponível até ${fmtDate(doc.expiresAt)}${days !== null && days > 0 ? ` (${days} dia${days === 1 ? "" : "s"})` : ""}.`}
                </p>
              </div>
              {!approved && !expired && (
                <div className="sf-portal-countdown" aria-label="Dias restantes">
                  <strong>{Math.max(days ?? 0, 0)}</strong>
                  <span>dia{days === 1 ? "" : "s"} para aprovar</span>
                </div>
              )}
            </section>

            <section className="sf-portal-card">
              <div className="sf-portal-facts">
                <div><span>Volume total</span><strong>{fmtVolume(doc.totals?.volume)}</strong></div>
                <div><span>Valor estimado</span><strong>{fmtMoney(Number(doc.totals?.revenue ?? 0))}</strong></div>
                <div><span>Tarifa</span><strong>{doc.commercialConditions?.tariffBasis ?? "—"}</strong></div>
                <div><span>Vigência do contrato</span><strong>{fmtDate(doc.term?.start)} a {fmtDate(doc.term?.end)}</strong></div>
              </div>
              <table className="sf-portal-table">
                <thead>
                  <tr>
                    <th>Período</th>
                    <th>Trecho</th>
                    <th>Serviço</th>
                    <th>Volume</th>
                    <th>Tarifa</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.items ?? []).flatMap((item: Record<string, any>) =>
                    (item.schedules ?? []).map((schedule: Record<string, any>, index: number) => (
                      <tr key={`${item.flowCode}-${schedule.key}-${schedule.service}-${index}`}>
                        <td>{periodLabel(schedule.year, schedule.month)}</td>
                        <td>
                          {item.origin} → {item.destination} · {item.merchandise}
                        </td>
                        <td>{schedule.service}</td>
                        <td>
                          {fmtVolume(schedule.volume)} {item.unit}
                        </td>
                        <td>{fmtTariff(usesCbs ? schedule.tariffCbs : schedule.tariffNet)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              <p className="sf-portal-note">
                As demais condições (reajuste, Take or Pay e cláusulas) são as do contrato Nº{" "}
                {doc.baseContract?.netlexNumber ?? "—"}, que não é alterado por esta ordem.
              </p>
              {!approved && !expired && (
                <div className="sf-portal-actions">
                  <label>
                    <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> Li e
                    concordo com as condições desta ordem de vendas.
                  </label>
                  <button className="sf-portal-approve" disabled={!accepted || busy} onClick={approve}>
                    {busy ? "Aprovando…" : "Aprovar ordem de vendas"}
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

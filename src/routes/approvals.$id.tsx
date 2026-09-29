import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { decideQuoteApproval, getApprovalFull } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";

export const Route = createFileRoute("/approvals/$id")({
  head: () => ({ meta: [{ title: "Alçada | CRM" }] }),
  component: ApprovalDetailPage,
});

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function ApprovalDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const { data: approval, isLoading } = useQuery({
    queryKey: ["approval-full", id],
    queryFn: () => getApprovalFull({ data: { id } }) as Promise<any>,
  });

  async function decide(decision: "Aprovada" | "Rejeitada") {
    setBusy(true);
    try {
      await decideQuoteApproval({
        data: { id, decision, note: note || undefined },
      });
      toast.success(decision === "Aprovada" ? "Alçada aprovada." : "Alçada rejeitada.");
      await qc.invalidateQueries({ queryKey: ["approval-full", id] });
      await qc.invalidateQueries({ queryKey: ["approvals"] });
      await qc.invalidateQueries({ queryKey: ["home-dashboard"] });
    } catch (error) {
      toast.error("Não foi possível registrar a decisão", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Carregando solicitação…</div>
      </SfShell>
    );
  if (!approval)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>
          Solicitação não encontrada. <Link to="/approvals">Voltar à fila</Link>
        </div>
      </SfShell>
    );

  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Alçadas de Cotação</div>
          <h1 className="sf-ph-title">{approval.quote_number}</h1>
          <div className="sf-ph-sub">
            Solicitação de alçada {approval.alcada_level} · status {approval.status}
          </div>
        </div>
      </div>
      <div style={{ padding: "0 24px 32px", display: "grid", gap: 16, maxWidth: 720 }}>
        <div className="sf-card" style={{ padding: 16, display: "grid", gap: 8 }}>
          <Row label="Cotação">
            <Link to="/quotes/$id" params={{ id: approval.quote_id }}>
              {approval.quote_number} · {approval.quote_name}
            </Link>
          </Row>
          <Row label="Conta">{approval.account_name}</Row>
          <Row label="Oportunidade">
            <Link to="/opportunities/$id" params={{ id: approval.opportunity_id }}>
              {approval.opportunity_name}
            </Link>
          </Row>
          <Row label="Alçada exigida">{approval.alcada_level}</Row>
          <Row label="Desvio máximo">{Number(approval.max_discount_pct).toFixed(2)}%</Row>
          <Row label="Solicitada em">{fmtDate(approval.requested_at)}</Row>
          <Row label="Status">{approval.status}</Row>
          {approval.decided_by_name && (
            <>
              <Row label="Decidida por">{approval.decided_by_name}</Row>
              <Row label="Decidida em">{fmtDate(approval.decided_at)}</Row>
              <Row label="Comentário">{approval.decision_note ?? "—"}</Row>
            </>
          )}
        </div>
        {approval.status === "Pendente" && (
          <div className="sf-card" style={{ padding: 16 }}>
            <strong>Decidir alçada</strong>
            <p style={{ fontSize: 12, color: "#706e6b" }}>
              {approval.can_decide
                ? "Aprovar libera a Cotação para conclusão; rejeitar mantém os preços bloqueados."
                : "Logue em Configurações como aprovador do nível exigido para decidir esta solicitação."}
            </p>
            <label style={{ fontSize: 12, display: "grid", gap: 4, margin: "10px 0" }}>
              Comentário (opcional)
              <textarea
                className="sf-input"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Justificativa da decisão"
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="sf-btn sf-btn--brand"
                disabled={busy || !approval.can_decide}
                onClick={() => decide("Aprovada")}
              >
                {busy ? "Registrando…" : "Aprovar"}
              </button>
              <button
                className="sf-btn"
                disabled={busy || !approval.can_decide}
                onClick={() => decide("Rejeitada")}
              >
                {busy ? "Registrando…" : "Rejeitar"}
              </button>
            </div>
          </div>
        )}
        <div>
          <Link to="/approvals" className="sf-btn">
            Voltar à fila
          </Link>
        </div>
      </div>
    </SfShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, fontSize: 14 }}>
      <span style={{ color: "#706e6b" }}>{label}</span>
      <span>{children}</span>
    </div>
  );
}

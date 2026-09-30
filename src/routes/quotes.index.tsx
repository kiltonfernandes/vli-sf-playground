import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { generateQuoteBundle, listOpportunities, listQuotes, saveRecord } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
import { SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { randomSeed } from "@/lib/generators";
import { isQuoteSegment } from "@/lib/segments";

type Opp = {
  id: string;
  name: string;
  account_name: string;
  stage: string;
  instrument_type: string;
  segment: string | null;
};
export const Route = createFileRoute("/quotes/")({
  head: () => ({ meta: [{ title: "Cotações | CRM" }] }),
  component: QuotesPage,
});

function QuotesPage() {
  const qc = useQueryClient(),
    navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false),
    [generateOpen, setGenerateOpen] = useState(false),
    [seed, setSeed] = useState(randomSeed()),
    [count, setCount] = useState(4),
    [opportunityId, setOpportunityId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { data: quotes = [] } = useQuery({
    queryKey: ["quotes"],
    queryFn: async () => (await listQuotes()) as any[],
  });
  const { data: opportunities = [] } = useQuery({
    queryKey: ["opportunities"],
    queryFn: async () => (await listOpportunities()) as Opp[],
  });
  const eligible = useMemo(
    () =>
      opportunities.filter(
        (o) =>
          o.stage === "Negociação" &&
          isQuoteSegment(o.segment) &&
          ["Contrato", "ACS"].includes(o.instrument_type),
      ),
    [opportunities],
  );
  const eligibleByLabel = new Map(
    eligible.map((o) => [`${o.account_name} · ${o.name} · ${o.instrument_type}`, o.id]),
  );
  const columns: Column<any>[] = [
    {
      key: "number",
      label: "Número",
      render: (row) => (
        <Link
          to="/quotes/$id"
          params={{ id: row.id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {row.quote_number}
        </Link>
      ),
      sortValue: (r) => r.quote_number,
      searchValue: (r) => `${r.quote_number} ${r.name}`,
    },
    {
      key: "name",
      label: "Cotação",
      render: (r) => (
        <Link to="/quotes/$id" params={{ id: r.id }} style={{ color: "#0176d3" }}>
          {r.name}
        </Link>
      ),
      sortValue: (r) => r.name,
    },
    {
      key: "opportunity",
      label: "Oportunidade",
      render: (r) => r.opportunity_name,
      sortValue: (r) => r.opportunity_name,
      searchValue: (r) => r.opportunity_name,
    },
    {
      key: "account",
      label: "Conta",
      render: (r) => r.account_name,
      sortValue: (r) => r.account_name,
    },
    { key: "type", label: "Tipo", render: (r) => r.record_type, sortValue: (r) => r.record_type },
    {
      key: "status",
      label: "Status",
      render: (r) => (r.is_synced ? "Sincronizada" : r.status),
      sortValue: (r) => r.status,
    },
    { key: "seed", label: "Seed", render: (r) => r.seed, sortValue: (r) => Number(r.seed) },
  ];
  const fields: FieldDef[] = [
    {
      name: "opportunity_label",
      label: "Oportunidade",
      type: "select",
      options: [...eligibleByLabel.keys()],
      required: true,
    },
    { name: "name", label: "Nome da Cotação", required: true },
    {
      name: "record_type",
      label: "Tipo de Cotação",
      type: "select",
      options: ["VLI_General"],
      required: true,
    },
    { name: "seed", label: "Seed", type: "number", required: true },
  ];
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["quotes"] });
  };
  async function generate() {
    setError("");
    setBusy(true);
    try {
      const result = await generateQuoteBundle({
        data: { opportunityId, seed, scheduleCount: count },
      });
      await refresh();
      setGenerateOpen(false);
      await navigate({ to: "/quotes/$id", params: { id: result.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível gerar a Cotação.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Vendas</div>
          <h1 className="sf-ph-title">Cotações</h1>
          <div className="sf-ph-sub">
            Cotação → Itens por fluxo e serviço → Agendas por período. Escopo atual: Ferroviário, Portuário e
            Ferroviário + Portuário, Contrato e ACS.
          </div>
        </div>
        <div className="sf-ph-actions">
          <button className="sf-btn" onClick={() => setNewOpen(true)}>
            Nova Cotação manual
          </button>
          <button
            className="sf-btn sf-btn--brand"
            onClick={() => {
              setSeed(randomSeed());
              setGenerateOpen(true);
            }}
          >
            Gerar Cotação + itens + agendas
          </button>
        </div>
      </div>
      <SfListView
        rows={quotes}
        columns={columns}
        rowKey={(r) => r.id}
        itemLabel="cotações"
        objectKey="quotes"
        defaultSortKey="number"
        rowActions={[
          { label: "Abrir", onRun: (r) => navigate({ to: "/quotes/$id", params: { id: r.id } }) },
        ]}
      />
      {newOpen && (
        <SfRecordDialog
          title="Nova Cotação"
          table="quotes"
          fields={fields}
          defaults={{ opportunity_label: "", name: "", record_type: "VLI_General", seed }}
          transform={(form) => {
            const { opportunity_label, ...rest } = form;
            return {
              ...rest,
              opportunity_id: eligibleByLabel.get(opportunity_label),
              status: "Rascunho",
              is_synced: 0,
            };
          }}
          onClose={() => setNewOpen(false)}
          onSaved={refresh}
        />
      )}
      {generateOpen && (
        <div className="sf-modal-backdrop" onClick={() => setGenerateOpen(false)}>
          <div
            className="sf-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Gerar Cotação com dados de teste"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sf-modal-header">
              <h2>Gerar pacote de Cotação</h2>
            </div>
            <div className="sf-modal-body">
              <p>
                Cria uma Cotação e dados relacionados determinísticos para a Oportunidade escolhida.
              </p>
              <label className="sf-label">Oportunidade ferroviária</label>
              <select
                className="sf-input"
                value={opportunityId}
                onChange={(e) => setOpportunityId(e.target.value)}
              >
                <option value="">— Selecione uma oportunidade em Negociação —</option>
                {eligible.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.account_name} · {o.name} · {o.instrument_type}
                  </option>
                ))}
              </select>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}
              >
                <div>
                  <label className="sf-label">Seed</label>
                  <input
                    className="sf-input"
                    type="number"
                    min={1}
                    value={seed}
                    onChange={(e) => setSeed(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="sf-label">Agendas mensais por fluxo</label>
                  <input
                    className="sf-input"
                    type="number"
                    min={1}
                    max={24}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#706e6b" }}>
                A mesma seed repete número, volumes, tarifas, serviços e rateios. Os registros ficam
                salvos no app e ligados à oportunidade.
              </p>
              {error && (
                <div role="alert" style={{ color: "#ba0517" }}>
                  {error}
                </div>
              )}
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn" onClick={() => setGenerateOpen(false)}>
                Cancelar
              </button>
              <button
                className="sf-btn sf-btn--brand"
                disabled={busy || !opportunityId}
                onClick={generate}
              >
                {busy ? "Gerando…" : "Gerar dados"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SfShell>
  );
}

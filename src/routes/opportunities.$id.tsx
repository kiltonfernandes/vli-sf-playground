import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getOpportunityFull,
  listAccountOptions,
  listOpportunityQuotes,
  saveRecord,
  deleteRecord,
  deleteRecordsBulk,
} from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfDeleteButton, SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";
import { SfListView, type Column } from "@/components/SfListView";
import { fmtDate, fmtMoney } from "@/lib/format";

const INSTRUMENTS = ["Contrato", "ACS", "Aditivo", "Outros Serviços"];
const STAGES = ["Prospecção", "Negociação", "Aprovação", "Formalização", "Fechado"];
const SEGMENTS = ["Ferroviário", "Portuário", "Rodoviário"];
const quoteFields: FieldDef[] = [
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

export const Route = createFileRoute("/opportunities/$id")({
  head: () => ({
    meta: [
      { title: "Oportunidade | CRM" },
      { name: "description", content: "Detalhes da oportunidade." },
    ],
  }),
  component: OpportunityRecordPage,
});

function OpportunityRecordPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("quotes");
  const [bulkQuoteRows, setBulkQuoteRows] = useState<any[] | null>(null);
  const [editingQuote, setEditingQuote] = useState(false);
  const [quoteToEdit, setQuoteToEdit] = useState<any | null>(null);
  const [pathOpen, setPathOpen] = useState(true);
  const [pathBusy, setPathBusy] = useState(false);
  const [pathMessage, setPathMessage] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["opportunity-full", id],
    queryFn: () => getOpportunityFull({ data: { id } }),
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-min"],
    queryFn: async () => (await listAccountOptions()) as { id: string; name: string }[],
  });
  const accountIdByName = useMemo(
    () => new Map(accounts.map((account) => [account.name, account.id])),
    [accounts],
  );
  const { data: quoteRows = [], refetch: refetchQuotes } = useQuery({
    queryKey: ["opportunity-quotes", id],
    queryFn: async () => (await listOpportunityQuotes({ data: { opportunityId: id } })) as any[],
    enabled: !!id,
  });

  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 32 }}>Carregando oportunidade…</div>
      </SfShell>
    );
  if (!data?.opportunity)
    return (
      <SfShell>
        <div style={{ padding: 32 }}>
          Oportunidade não encontrada.{" "}
          <Link to="/opportunities" style={{ color: "#0176d3" }}>
            Voltar
          </Link>
        </div>
      </SfShell>
    );

  const opportunity = data.opportunity;
  const account = data.account;
  const fields: FieldDef[] = [
    { name: "name", label: "Nome da oportunidade", required: true },
    {
      name: "account_name",
      label: "Conta de gestão",
      type: "select",
      options: accounts.map((entry) => entry.name),
      required: true,
    },
    {
      name: "instrument_type",
      label: "Tipo de instrumento",
      type: "select",
      options: INSTRUMENTS,
      required: true,
    },
    { name: "stage", label: "Estágio", type: "select", options: STAGES, required: true },
    { name: "segment", label: "Segmento", type: "select", options: SEGMENTS },
    { name: "amount", label: "Valor da oportunidade", type: "number" },
    { name: "close_date", label: "Data de fechamento", type: "date" },
    { name: "contract_start", label: "Início da vigência", type: "date" },
    { name: "contract_end", label: "Fim da vigência", type: "date" },
    { name: "diesel_pct", label: "Reajuste diesel (%)", type: "number" },
    { name: "igpm_pct", label: "Reajuste IGP-M (%)", type: "number" },
    { name: "ipca_pct", label: "Reajuste IPCA (%)", type: "number" },
    { name: "contracting_parties", label: "Contratante(s)" },
    { name: "vli_entity", label: "Entidade contratada VLI" },
    { name: "joint_debtor", label: "Devedor solidário" },
    {
      name: "integration_tariff",
      label: "Tarifa de integração",
      type: "select",
      options: ["CBS", "Líquida"],
    },
    { name: "take_or_pay", label: "Take or Pay", type: "checkbox" },
  ];
  const defaults = {
    name: opportunity.name ?? "",
    account_name: account?.name ?? "",
    instrument_type: opportunity.instrument_type ?? "Contrato",
    stage: opportunity.stage ?? "Prospecção",
    segment: opportunity.segment ?? "",
    amount: opportunity.amount ?? 0,
    close_date: opportunity.close_date ?? "",
    contract_start: opportunity.contract_start ?? "",
    contract_end: opportunity.contract_end ?? "",
    diesel_pct: opportunity.diesel_pct ?? 0,
    igpm_pct: opportunity.igpm_pct ?? 0,
    ipca_pct: opportunity.ipca_pct ?? 0,
    contracting_parties: opportunity.contracting_parties ?? "",
    vli_entity: opportunity.vli_entity ?? "",
    joint_debtor: opportunity.joint_debtor ?? "",
    integration_tariff: opportunity.integration_tariff ?? "Líquida",
    take_or_pay: !!opportunity.take_or_pay,
  };
  const transform = (form: Record<string, any>) => {
    const { account_name, ...rest } = form;
    return {
      ...rest,
      account_id: accountIdByName.get(account_name),
      take_or_pay: rest.take_or_pay ? 1 : 0,
    };
  };

  const quoteDefinitions =
    opportunity.segment === "Ferroviário" &&
    ["Contrato", "ACS"].includes(opportunity.instrument_type)
      ? [
          {
            key: "quotes",
            label: "Cotações",
            table: "quotes",
            load: async (parentId: string) =>
              (await listOpportunityQuotes({ data: { opportunityId: parentId } })) as any[],
            columns: [
              {
                key: "quote",
                label: "Número",
                render: (row: any) => (
                  <Link
                    to="/quotes/$id"
                    params={{ id: row.id }}
                    style={{ color: "#0176d3", fontWeight: 600 }}
                  >
                    {row.quote_number}
                  </Link>
                ),
                sortValue: (row: any) => row.quote_number ?? "",
              },
              {
                key: "name",
                label: "Nome",
                render: (row: any) => (
                  <Link to="/quotes/$id" params={{ id: row.id }} style={{ color: "#0176d3" }}>
                    {row.name}
                  </Link>
                ),
                sortValue: (row: any) => row.name,
              },
              {
                key: "status",
                label: "Status",
                render: (row: any) => (row.is_synced ? "Sincronizada" : row.status),
                sortValue: (row: any) => row.status,
              },
              {
                key: "seed",
                label: "Seed",
                render: (row: any) => String(row.seed),
                sortValue: (row: any) => Number(row.seed),
              },
            ],
            fields: [
              { name: "name", label: "Nome da Cotação", required: true },
              {
                name: "record_type",
                label: "Tipo de Cotação",
                type: "select" as const,
                options: ["VLI_General"],
                required: true,
              },
              { name: "seed", label: "Seed", type: "number" as const },
            ],
            createDefaults: () => ({
              name: `${opportunity.name} · Ferroviário`,
              record_type: "VLI_General",
              status: "Rascunho",
              is_synced: 0,
              seed: 20260929,
            }),
            rowDefaults: (row: any) => ({
              name: row.name,
              record_type: row.record_type,
              seed: row.seed,
            }),
            transform: (form: Record<string, any>, parentId: string) => ({
              ...form,
              opportunity_id: parentId,
              status: "Rascunho",
              is_synced: 0,
              seed: Number(form.seed || 20260929),
            }),
            refreshKeys: (parentId: string) => [["quotes"], ["opportunity-full", parentId]],
            defaultVisible: true,
          },
        ]
      : [];
  const quoteColumns: Column<any>[] = [
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
      sortValue: (row) => row.quote_number ?? "",
    },
    {
      key: "name",
      label: "Nome",
      render: (row) => (
        <Link to="/quotes/$id" params={{ id: row.id }}>
          {row.name}
        </Link>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (row.is_synced ? "Sincronizada" : row.status),
      sortValue: (row) => row.status,
    },
    {
      key: "seed",
      label: "Seed",
      render: (row) => String(row.seed),
      sortValue: (row) => Number(row.seed),
    },
  ];
  const selectedTab = quoteDefinitions.length ? activeTab : "details";
  const openQuoteForm = (mode: "single" | "bulk") => {
    const open = () => (mode === "single" ? setEditingQuote(true) : setBulkQuoteRows([]));
    if (opportunity.stage === "Negociação") {
      open();
      return;
    }
    if (opportunity.stage !== "Prospecção") {
      toast.error("Cotação indisponível nesta etapa", {
        description: "A oportunidade precisa estar em Negociação para criar ou editar cotações.",
      });
      return;
    }
    toast("Avance a oportunidade para criar a Cotação", {
      description: "A criação de Cotações exige uma oportunidade em Negociação.",
      action: {
        label: "Avançar e continuar",
        onClick: () => {
          void (async () => {
            try {
              await saveRecord({
                data: { table: "opportunities", recordId: id, data: { stage: "Negociação" } },
              });
              await Promise.all([
                qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
                qc.invalidateQueries({ queryKey: ["opportunities"] }),
                qc.invalidateQueries({ queryKey: ["account-full", opportunity.account_id] }),
              ]);
              toast.success("Oportunidade avançada para Negociação");
              setPathMessage("Etapa atualizada para Negociação.");
              open();
            } catch (error) {
              toast.error("Não foi possível avançar a oportunidade", {
                description: error instanceof Error ? error.message : "Tente novamente.",
              });
            }
          })();
        },
      },
    });
  };

  return (
    <SfShell>
      <div
        className="sf-page-header"
        style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
      >
        <div>
          <div className="sf-ph-eyebrow">Oportunidade</div>
          <h1 className="sf-ph-title">{opportunity.name}</h1>
          <div className="sf-ph-sub">
            {opportunity.instrument_type} · {opportunity.stage} ·{" "}
            {account ? (
              <Link to="/accounts/$id" params={{ id: account.id }} style={{ color: "#0176d3" }}>
                {account.name}
              </Link>
            ) : (
              "Sem conta"
            )}
          </div>
        </div>
        <div className="sf-ph-actions" style={{ marginLeft: "auto", flexWrap: "wrap" }}>
          <Link to="/opportunities" className="sf-btn">
            ← Voltar
          </Link>
          <button className="sf-btn sf-btn--brand" onClick={() => setEditing(true)}>
            Editar
          </button>
          <SfDeleteButton table="opportunities" id={id} redirectTo="/opportunities" />
        </div>
      </div>

      <OpportunityPath
        stage={opportunity.stage}
        opportunityId={id}
        accountName={account?.name ?? "—"}
        instrument={opportunity.instrument_type}
        segment={opportunity.segment ?? "—"}
        closeDate={opportunity.close_date ? fmtDate(opportunity.close_date) : "—"}
        open={pathOpen}
        busy={pathBusy}
        message={pathMessage}
        onToggle={() => setPathOpen((value) => !value)}
        onEdit={() => setEditing(true)}
        onAdvance={async () => {
          setPathBusy(true);
          setPathMessage("");
          try {
            await saveRecord({
              data: { table: "opportunities", recordId: id, data: { stage: "Negociação" } },
            });
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["opportunity-full", id] }),
              qc.invalidateQueries({ queryKey: ["opportunities"] }),
              qc.invalidateQueries({ queryKey: ["account-full", opportunity.account_id] }),
            ]);
            setPathMessage("Etapa atualizada para Negociação.");
          } catch (error) {
            setPathMessage(
              error instanceof Error ? error.message : "Não foi possível atualizar a etapa.",
            );
          } finally {
            setPathBusy(false);
          }
        }}
      />

      <div className="sf-highlights">
        <Highlight label="Conta de gestão" value={account?.name ?? "—"} />
        <Highlight label="Tipo de instrumento" value={opportunity.instrument_type} />
        <Highlight label="Estágio" value={opportunity.stage} />
        <Highlight label="Segmento" value={opportunity.segment ?? "—"} />
        <Highlight label="Valor" value={fmtMoney(Number(opportunity.amount))} />
        <Highlight
          label="Fechamento previsto"
          value={opportunity.close_date ? fmtDate(opportunity.close_date) : "—"}
        />
      </div>

      <div style={{ padding: 24 }}>
        <div
          role="tablist"
          aria-label="Seções da oportunidade"
          style={{ display: "flex", gap: 24, borderBottom: "1px solid #c9c9c9", marginBottom: 20 }}
        >
          {[
            ...(quoteDefinitions.length ? [{ id: "quotes", label: "Cotações" }] : []),
            { id: "details", label: "Detalhes" },
          ].map((tab) => (
            <button
              key={tab.id}
              id={`opportunity-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.id}
              aria-controls={`opportunity-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "12px 4px",
                marginBottom: -1,
                border: 0,
                borderBottom:
                  selectedTab === tab.id ? "3px solid #0176d3" : "3px solid transparent",
                background: "transparent",
                color: selectedTab === tab.id ? "#014486" : "#444",
                fontWeight: selectedTab === tab.id ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {quoteDefinitions.length > 0 && (
          <section
            id="opportunity-panel-quotes"
            role="tabpanel"
            aria-labelledby="opportunity-tab-quotes"
            hidden={selectedTab !== "quotes"}
          >
            <div className="sf-card">
              <div
                className="sf-card-header"
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span>Cotações ({quoteRows.length})</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="sf-btn" onClick={() => openQuoteForm("bulk")}>
                    Criar em lote
                  </button>
                  <button
                    className="sf-btn sf-btn--brand"
                    onClick={() => openQuoteForm("single")}
                  >
                    Nova Cotação
                  </button>
                </div>
              </div>
              <SfListView
                rows={quoteRows}
                columns={quoteColumns}
                rowKey={(row) => String(row.id)}
                itemLabel="cotações"
                bulkActions={[
                  { label: "Editar selecionadas", onRun: (rows) => setBulkQuoteRows(rows) },
                  {
                    label: "Excluir selecionadas",
                    variant: "danger",
                    onRun: async (rows) => {
                      if (!confirm(`Excluir ${rows.length} cotações selecionadas?`)) return;
                      await deleteRecordsBulk({
                        data: { table: "quotes", ids: rows.map((row) => String(row.id)) },
                      });
                      await refetchQuotes();
                    },
                  },
                ]}
                rowActions={[
                  { label: "Editar", onRun: (row) => setQuoteToEdit(row) },
                  {
                    label: "Excluir",
                    onRun: async (row) => {
                      if (!confirm(`Excluir a cotação “${row.name}”?`)) return;
                      await deleteRecord({ data: { table: "quotes", id: String(row.id) } });
                      await refetchQuotes();
                      await qc.invalidateQueries({ queryKey: ["quotes"] });
                    },
                  },
                ]}
              />
            </div>
          </section>
        )}

        <section
          id="opportunity-panel-details"
          role="tabpanel"
          aria-labelledby="opportunity-tab-details"
          hidden={selectedTab !== "details"}
          style={{
            display: selectedTab === "details" ? "grid" : undefined,
            gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)",
            gap: 16,
          }}
        >
          <Card title="Detalhes da oportunidade">
            <div className="sf-fields">
              <Field label="Nome" value={opportunity.name} />
              <Field label="Tipo de instrumento" value={opportunity.instrument_type} />
              <Field label="Estágio" value={opportunity.stage} />
              <Field label="Segmento" value={opportunity.segment ?? "—"} />
              <Field label="Valor da oportunidade" value={fmtMoney(Number(opportunity.amount))} />
              <Field
                label="Data de fechamento prevista"
                value={opportunity.close_date ? fmtDate(opportunity.close_date) : "—"}
              />
              <Field
                label="Início da vigência"
                value={opportunity.contract_start ? fmtDate(opportunity.contract_start) : "—"}
              />
              <Field
                label="Fim da vigência"
                value={opportunity.contract_end ? fmtDate(opportunity.contract_end) : "—"}
              />
              <Field label="Reajuste diesel" value={`${opportunity.diesel_pct}%`} />
              <Field label="Reajuste IGP-M" value={`${opportunity.igpm_pct}%`} />
              <Field label="Reajuste IPCA" value={`${opportunity.ipca_pct}%`} />
              <Field label="Contratante(s)" value={opportunity.contracting_parties ?? "—"} />
              <Field label="Entidade VLI" value={opportunity.vli_entity ?? "—"} />
              <Field label="Devedor solidário" value={opportunity.joint_debtor ?? "—"} />
              <Field label="Tarifa de integração" value={opportunity.integration_tariff} />
              <Field label="Take or Pay" value={opportunity.take_or_pay ? "Sim" : "Não"} />
            </div>
          </Card>
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Card title="Conta de gestão">
              {account ? (
                <div className="sf-fields">
                  <Field label="Conta" value={account.name} />
                  <Field label="Setor" value={account.industry ?? "—"} />
                  <Field
                    label="Local"
                    value={[account.city, account.state].filter(Boolean).join(", ") || "—"}
                  />
                </div>
              ) : (
                <div style={{ padding: 16 }}>Sem conta vinculada.</div>
              )}
            </Card>
          </div>
        </section>
      </div>
      {editingQuote && (
        <SfRecordDialog
          title="Nova Cotação"
          table="quotes"
          fields={quoteFields}
          defaults={{
            name: `${opportunity.name} · Ferroviário`,
            record_type: "VLI_General",
            status: "Rascunho",
            is_synced: 0,
            seed: 20260929,
          }}
          transform={(form) => ({
            ...form,
            opportunity_id: id,
            seed: Number(form.seed || 20260929),
          })}
          onClose={() => setEditingQuote(false)}
          onSaved={async () => {
            setEditingQuote(false);
            await refetchQuotes();
            await qc.invalidateQueries({ queryKey: ["quotes"] });
          }}
        />
      )}
      {quoteToEdit && (
        <SfRecordDialog
          title={`Editar ${quoteToEdit.name}`}
          table="quotes"
          recordId={quoteToEdit.id}
          fields={quoteFields}
          defaults={{
            name: quoteToEdit.name,
            record_type: quoteToEdit.record_type,
            seed: quoteToEdit.seed,
          }}
          transform={(form) => ({
            ...form,
            opportunity_id: id,
            seed: Number(form.seed || 20260929),
          })}
          onClose={() => setQuoteToEdit(null)}
          onSaved={async () => {
            setQuoteToEdit(null);
            await refetchQuotes();
            await qc.invalidateQueries({ queryKey: ["quotes"] });
          }}
        />
      )}
      {bulkQuoteRows !== null && (
        <SfBulkRecordDialog
          table="quotes"
          fields={quoteFields}
          defaults={{
            opportunity_id: id,
            name: `${opportunity.name} · Ferroviário`,
            record_type: "VLI_General",
            status: "Rascunho",
            is_synced: 0,
            seed: 20260929,
          }}
          rows={bulkQuoteRows.length ? bulkQuoteRows : undefined}
          transform={(form) => ({
            ...form,
            opportunity_id: id,
            seed: Number(form.seed || 20260929),
          })}
          onClose={() => setBulkQuoteRows(null)}
          onSaved={async () => {
            setBulkQuoteRows(null);
            await refetchQuotes();
            await qc.invalidateQueries({ queryKey: ["quotes"] });
          }}
        />
      )}
      {editing && (
        <SfRecordDialog
          title={`Editar ${opportunity.name}`}
          table="opportunities"
          recordId={id}
          fields={fields}
          defaults={defaults}
          transform={transform}
          onClose={() => setEditing(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["opportunity-full", id] });
            qc.invalidateQueries({ queryKey: ["opportunities"] });
            qc.invalidateQueries({ queryKey: ["account-full", opportunity.account_id] });
          }}
        />
      )}
    </SfShell>
  );
}

function OpportunityPath({
  stage,
  accountName,
  instrument,
  segment,
  closeDate,
  open,
  busy,
  message,
  onToggle,
  onEdit,
  onAdvance,
}: {
  stage: string;
  accountName: string;
  instrument: string;
  segment: string;
  closeDate: string;
  open: boolean;
  busy: boolean;
  message: string;
  onToggle: () => void;
  onEdit: () => void;
  onAdvance: () => void;
}) {
  const activeIndex = Math.max(0, STAGES.indexOf(stage));
  const canAdvance = stage === "Prospecção";
  const guidance: Record<string, string[]> = {
    Prospecção: [
      "Confirme a conta de gestão e o tipo de instrumento.",
      "Avance para Negociação para habilitar a preparação da cotação.",
    ],
    Negociação: [
      "Revise os dados comerciais e jurídicos da oportunidade.",
      "Para avançar, será necessário concluir e sincronizar uma cotação.",
    ],
    Aprovação: [
      "A oportunidade aguarda decisão das alçadas responsáveis.",
      "Uma aprovação registrada será necessária para formalizar.",
    ],
    Formalização: [
      "Prepare as partes, vigência, reajuste e tarifa de integração.",
      "O fechamento depende da formalização e da integração NetLex.",
    ],
    Fechado: ["O ciclo comercial da oportunidade foi concluído."],
  };
  return (
    <section className="sf-path-card" aria-label="Caminho da oportunidade">
      <button
        className="sf-path-collapse"
        aria-label={open ? "Recolher caminho" : "Expandir caminho"}
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? "⌃" : "⌄"}
      </button>
      {open && (
        <>
          <div className="sf-path-main">
            <div className="sf-path-steps" role="list" aria-label="Etapas">
              {STAGES.map((item, index) => (
                <div
                  key={item}
                  role="listitem"
                  aria-current={index === activeIndex ? "step" : undefined}
                  className={
                    "sf-path-step" +
                    (index < activeIndex ? " is-complete" : "") +
                    (index === activeIndex ? " is-current" : "")
                  }
                >
                  <span className="sf-path-check">{index < activeIndex ? "✓" : ""}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <button
              className="sf-btn sf-btn--brand sf-path-action"
              disabled={!canAdvance || busy}
              onClick={onAdvance}
            >
              {busy ? "Salvando…" : "✓  Marcar etapa como concluída"}
            </button>
          </div>
          <div className="sf-path-panels">
            <div className="sf-path-keyfields">
              <div className="sf-path-panel-heading">
                <span>Campos principais</span>
                <button className="sf-link" onClick={onEdit}>
                  Editar
                </button>
              </div>
              <div className="sf-path-field">
                <span>Conta de gestão</span>
                <strong>{accountName}</strong>
              </div>
              <div className="sf-path-field">
                <span>Tipo de instrumento</span>
                <strong>{instrument}</strong>
              </div>
              <div className="sf-path-field">
                <span>Segmento</span>
                <strong>{segment}</strong>
              </div>
              <div className="sf-path-field">
                <span>Fechamento previsto</span>
                <strong>{closeDate}</strong>
              </div>
            </div>
            <div className="sf-path-guidance">
              <div className="sf-path-panel-heading">Orientações para o sucesso</div>
              <ul>
                {(guidance[stage] ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {!canAdvance && stage !== "Fechado" && (
                <p className="sf-path-blocker">
                  {stage === "Negociação"
                    ? "Avanço bloqueado: conclua e sincronize uma Cotação primeiro."
                    : stage === "Aprovação"
                      ? "Avanço bloqueado: registre a aprovação antes da formalização."
                      : "Avanço bloqueado: a integração NetLex ainda não está disponível."}
                </p>
              )}
            </div>
          </div>
          {message && (
            <div className="sf-path-message" role="status">
              {message}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Highlight({ label, value }: { label: string; value: string }) {
  return (
    <div className="sf-highlight">
      <div className="sf-highlight-label">{label}</div>
      <div className="sf-highlight-value">{value}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sf-card">
      <div className="sf-card-header">{title}</div>
      {children}
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="sf-field">
      <div className="sf-field-label">{label}</div>
      <div className="sf-field-value">{value}</div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { deleteRecord, deleteRecordsBulk, listAccountOptions, listOpportunities } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
import { SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";
import { exportCsv } from "@/lib/csv";
import { fmtMoney } from "@/lib/format";
import { OPPORTUNITY_SEGMENTS } from "@/lib/segments";

const INSTRUMENTS = ["Contrato", "ACS", "Aditivo", "Outros Serviços"];
// Filtro da lista inclui os instrumentos pós-contrato, que só nascem de um Contrato em Assinatura.
const FILTER_INSTRUMENTS = [...INSTRUMENTS.slice(0, 3), "Ordem de Vendas", "Curva de Ajuste", "Outros Serviços"];
const STAGES = ["Prospecção", "Negociação", "Aprovação", "Formalização", "Fechado"];
const SEGMENTS = OPPORTUNITY_SEGMENTS;
type Opportunity = {
  id: string; account_id: string; account_name: string; name: string; instrument_type: string; stage: string;
  segment: string | null; amount: number; close_date: string | null; contract_start: string | null; contract_end: string | null;
  application_day: number; first_readjustment_date: string | null;
  diesel_pct: number; igpm_pct: number; ipca_pct: number; contracting_parties: string | null; vli_entity: string | null;
  joint_debtor: string | null; integration_tariff: string; take_or_pay: number;
};

export const Route = createFileRoute("/opportunities/")({
  head: () => ({ meta: [{ title: "Oportunidades | CRM" }, { name: "description", content: "Negociações comerciais ligadas às contas." }] }),
  component: OpportunitiesPage,
});

function OpportunitiesPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editRow, setEditRow] = useState<Opportunity | null>(null);
  const [bulkRows, setBulkRows] = useState<Opportunity[] | null>(null);
  const [bulkCreate, setBulkCreate] = useState(false);
  const { data: rows = [] } = useQuery({ queryKey: ["opportunities"], queryFn: async () => await listOpportunities() as Opportunity[] });
  const { data: accounts = [] } = useQuery({ queryKey: ["accounts-min"], queryFn: async () => await listAccountOptions() as { id: string; name: string }[] });
  const accountIdByName = useMemo(() => new Map(accounts.map((account) => [account.name, account.id])), [accounts]);

  const fields: FieldDef[] = [
    { name: "name", label: "Nome da oportunidade", required: true },
    { name: "account_name", label: "Conta de gestão", type: "select", options: accounts.map((account) => account.name), required: true },
    { name: "instrument_type", label: "Tipo de instrumento", type: "select", options: INSTRUMENTS, required: true },
    { name: "stage", label: "Estágio", type: "select", options: STAGES, required: true },
    { name: "segment", label: "Segmento", type: "select", options: SEGMENTS },
    { name: "amount", label: "Valor da oportunidade", type: "number" },
    { name: "close_date", label: "Data de fechamento", type: "date" },
    { name: "contract_start", label: "Início da vigência", type: "date" },
    { name: "contract_end", label: "Fim da vigência", type: "date" },
    { name: "first_readjustment_date", label: "Data do primeiro reajuste", type: "date" },
    { name: "application_day", label: "Dia de aplicação", type: "select", options: ["1", "10", "20"], required: true },
    { name: "diesel_pct", label: "Reajuste diesel (%)", type: "number" },
    { name: "igpm_pct", label: "Reajuste IGP-M (%)", type: "number" },
    { name: "ipca_pct", label: "Reajuste IPCA (%)", type: "number" },
    { name: "road_diesel_period", label: "Apuração do diesel rodoviário", placeholder: "Ex.: dia 25 ao dia 26" },
    { name: "road_diesel_pct", label: "Repasse diesel rodoviário (%)", type: "number" },
    { name: "road_diesel_base", label: "Base diesel rodoviária", type: "select", options: ["S10", "S500"] },
    { name: "road_reference_margin_pct", label: "Margem de referência para fluxo novo (%)", type: "number" },
    { name: "contracting_parties", label: "Contratante(s)" },
    { name: "vli_entity", label: "Entidade contratada VLI" },
    { name: "joint_debtor", label: "Devedor solidário" },
    { name: "integration_tariff", label: "Tarifa padrão para novas Cotações", type: "select", options: ["CBS", "Líquida"] },
  ];
  const columns: Column<Opportunity>[] = [
    { key: "name", label: "Oportunidade", render: (row) => <Link to="/opportunities/$id" params={{ id: row.id }} style={{ color: "#0176d3", fontWeight: 600 }}>{row.name}</Link>, sortValue: (row) => row.name, searchValue: (row) => row.name },
    { key: "account", label: "Conta de gestão", render: (row) => row.account_name, sortValue: (row) => row.account_name, searchValue: (row) => row.account_name },
    { key: "instrument", label: "Instrumento", render: (row) => row.instrument_type, sortValue: (row) => row.instrument_type, filterOptions: FILTER_INSTRUMENTS, filterValue: (row) => row.instrument_type },
    { key: "stage", label: "Estágio", render: (row) => row.stage, sortValue: (row) => row.stage, filterOptions: STAGES, filterValue: (row) => row.stage },
    { key: "segment", label: "Segmento", render: (row) => row.segment ?? "—", sortValue: (row) => row.segment ?? "", filterOptions: SEGMENTS, filterValue: (row) => row.segment },
    { key: "amount", label: "Valor", align: "right", render: (row) => fmtMoney(Number(row.amount)), sortValue: (row) => Number(row.amount) },
    { key: "close", label: "Fechamento previsto", render: (row) => row.close_date ?? "—", sortValue: (row) => row.close_date ?? "" },
  ];
  const transform = (form: Record<string, any>) => {
    const { account_name, ...rest } = form;
    const { take_or_pay: _legacyTop, take_or_pay_config: _topConfig, ...opportunityData } = rest;
    return { ...opportunityData, application_day: Number(rest.application_day ?? 10), account_id: accountIdByName.get(account_name) };
  };
  const defaults = (row?: Opportunity | null) => ({
    name: row?.name ?? "", account_name: row?.account_name ?? "",
    instrument_type: row?.instrument_type ?? "Contrato", stage: row?.stage ?? "Prospecção",
    segment: row?.segment ?? "", amount: row?.amount ?? 0, close_date: row?.close_date ?? "",
    contract_start: row?.contract_start ?? "", contract_end: row?.contract_end ?? "",
    application_day: String(row?.application_day ?? 10),
    first_readjustment_date: row?.first_readjustment_date ?? "",
    diesel_pct: row?.diesel_pct ?? 0, igpm_pct: row?.igpm_pct ?? 0, ipca_pct: row?.ipca_pct ?? 0,
    road_diesel_period: (row as any)?.road_diesel_period ?? "",
    road_diesel_pct: (row as any)?.road_diesel_pct ?? 0,
    road_diesel_base: (row as any)?.road_diesel_base ?? "S10",
    road_reference_margin_pct: (row as any)?.road_reference_margin_pct ?? 5,
    contracting_parties: row?.contracting_parties ?? "", vli_entity: row?.vli_entity ?? "VLI Multimodal S.A.",
    joint_debtor: row?.joint_debtor ?? "", integration_tariff: row?.integration_tariff ?? "Líquida",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["opportunities"] });
  async function remove(row: Opportunity) {
    if (!confirm(`Excluir a oportunidade "${row.name}"?`)) return;
    await deleteRecord({ data: { table: "opportunities", id: row.id } });
    await refresh();
  }

  return <SfShell>
    <div className="sf-page-header">
      <div><div className="sf-ph-eyebrow">Vendas</div><h1 className="sf-ph-title">Oportunidades</h1><div className="sf-ph-sub">{rows.length} negociações • Cada oportunidade pertence a uma conta de gestão.</div></div>
      <div className="sf-ph-actions"><button className="sf-btn" onClick={() => setBulkCreate(true)}>Criar em lote</button><button className="sf-btn sf-btn--brand" onClick={() => setShowNew(true)}>Nova oportunidade</button></div>
    </div>
    <SfListView rows={rows} columns={columns} rowKey={(row) => row.id} itemLabel="oportunidades" objectKey="opportunities" defaultSortKey="name"
      bulkActions={[
        { label: "Editar selecionadas", onRun: (selected) => setBulkRows(selected) },
        { label: "Exportar CSV", onRun: (selected) => exportCsv(selected, fields) },
        { label: "Excluir selecionadas", variant: "danger", onRun: async (selected) => {
          if (!confirm(`Excluir ${selected.length} oportunidades selecionadas?`)) return;
          await deleteRecordsBulk({ data: { table: "opportunities", ids: selected.map((row) => row.id) } }); await refresh();
        } },
      ]}
      rowActions={[{ label: "Editar", onRun: (row) => setEditRow(row) }, { label: "Excluir", onRun: remove }]} />
    {(showNew || editRow) && <SfRecordDialog title={editRow ? `Editar ${editRow.name}` : "Nova oportunidade"} table="opportunities" fields={fields} defaults={defaults(editRow)} recordId={editRow?.id} transform={transform} onClose={() => { setShowNew(false); setEditRow(null); }} onSaved={refresh} />}
    {bulkCreate && <SfBulkRecordDialog table="opportunities" fields={fields} defaults={{ instrument_type: "Contrato", stage: "Prospecção", vli_entity: "VLI Multimodal S.A.", integration_tariff: "Líquida", application_day: "10" }} transform={transform} onClose={() => setBulkCreate(false)} onSaved={refresh} />}
    {bulkRows && <SfBulkRecordDialog table="opportunities" fields={fields} rows={bulkRows} defaults={{}} transform={transform} onClose={() => setBulkRows(null)} onSaved={refresh} />}
  </SfShell>;
}

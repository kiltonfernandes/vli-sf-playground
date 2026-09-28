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

const INSTRUMENTS = ["Contrato", "ACS", "Aditivo", "Outros Serviços"];
const STAGES = ["Prospecção", "Negociação", "Aprovação", "Formalização", "Fechado"];
const SEGMENTS = ["Ferroviário", "Portuário", "Rodoviário"];
type Opportunity = {
  id: string; account_id: string; account_name: string; name: string; instrument_type: string; stage: string;
  segment: string | null; amount: number; close_date: string | null; contract_start: string | null; contract_end: string | null;
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
    { name: "diesel_pct", label: "Reajuste diesel (%)", type: "number" },
    { name: "igpm_pct", label: "Reajuste IGP-M (%)", type: "number" },
    { name: "ipca_pct", label: "Reajuste IPCA (%)", type: "number" },
    { name: "contracting_parties", label: "Contratante(s)" },
    { name: "vli_entity", label: "Entidade contratada VLI" },
    { name: "joint_debtor", label: "Devedor solidário" },
    { name: "integration_tariff", label: "Tarifa de integração", type: "select", options: ["CBS", "Líquida"] },
    { name: "take_or_pay", label: "Take or Pay", type: "checkbox" },
  ];
  const columns: Column<Opportunity>[] = [
    { key: "name", label: "Oportunidade", render: (row) => <Link to="/opportunities/$id" params={{ id: row.id }} style={{ color: "#0176d3", fontWeight: 600 }}>{row.name}</Link>, sortValue: (row) => row.name, searchValue: (row) => row.name },
    { key: "account", label: "Conta de gestão", render: (row) => row.account_name, sortValue: (row) => row.account_name, searchValue: (row) => row.account_name },
    { key: "instrument", label: "Instrumento", render: (row) => row.instrument_type, sortValue: (row) => row.instrument_type, filterOptions: INSTRUMENTS, filterValue: (row) => row.instrument_type },
    { key: "stage", label: "Estágio", render: (row) => row.stage, sortValue: (row) => row.stage, filterOptions: STAGES, filterValue: (row) => row.stage },
    { key: "segment", label: "Segmento", render: (row) => row.segment ?? "—", sortValue: (row) => row.segment ?? "", filterOptions: SEGMENTS, filterValue: (row) => row.segment },
    { key: "amount", label: "Valor", align: "right", render: (row) => fmtMoney(Number(row.amount)), sortValue: (row) => Number(row.amount) },
    { key: "close", label: "Fechamento previsto", render: (row) => row.close_date ?? "—", sortValue: (row) => row.close_date ?? "" },
  ];
  const transform = (form: Record<string, any>) => {
    const { account_name, ...rest } = form;
    return { ...rest, account_id: accountIdByName.get(account_name), take_or_pay: rest.take_or_pay ? 1 : 0 };
  };
  const defaults = (row?: Opportunity | null) => ({
    name: row?.name ?? "", account_name: row?.account_name ?? "",
    instrument_type: row?.instrument_type ?? "Contrato", stage: row?.stage ?? "Prospecção",
    segment: row?.segment ?? "", amount: row?.amount ?? 0, close_date: row?.close_date ?? "",
    contract_start: row?.contract_start ?? "", contract_end: row?.contract_end ?? "",
    diesel_pct: row?.diesel_pct ?? 0, igpm_pct: row?.igpm_pct ?? 0, ipca_pct: row?.ipca_pct ?? 0,
    contracting_parties: row?.contracting_parties ?? "", vli_entity: row?.vli_entity ?? "VLI Multimodal S.A.",
    joint_debtor: row?.joint_debtor ?? "", integration_tariff: row?.integration_tariff ?? "Líquida",
    take_or_pay: !!row?.take_or_pay,
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
    {bulkCreate && <SfBulkRecordDialog table="opportunities" fields={fields} defaults={{ instrument_type: "Contrato", stage: "Prospecção", vli_entity: "VLI Multimodal S.A.", integration_tariff: "Líquida" }} transform={transform} onClose={() => setBulkCreate(false)} onSaved={refresh} />}
    {bulkRows && <SfBulkRecordDialog table="opportunities" fields={fields} rows={bulkRows} defaults={{}} transform={transform} onClose={() => setBulkRows(null)} onSaved={refresh} />}
  </SfShell>;
}

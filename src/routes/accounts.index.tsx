import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listAccounts, deleteRecord } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
import { SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";
import { exportCsv } from "@/lib/csv";
import { fmtMoney, HealthPill, StatusPill } from "@/lib/format";
import { TIPOS, STATUS, RISCOS, SAUDE } from "@/lib/options";

export const Route = createFileRoute("/accounts/")({
  head: () => ({
    meta: [
      { title: "Contas | CRM" },
      { name: "description", content: "Todas as contas cadastradas no CRM." },
      { property: "og:title", content: "Contas | CRM" },
      { property: "og:description", content: "Todas as contas cadastradas no CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountsListPage,
});

type Account = {
  id: string;
  name: string;
  type: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  account_owner: string | null;
  health: string;
  customer_status: string;
  risk_level: string;
  lifetime_value: number;
  branch_name: string | null;
  phone?: string | null;
  website?: string | null;
  revenue?: number;
  employees?: number;
  notes?: string | null;
};

function AccountsListPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editRow, setEditRow] = useState<Account | null>(null);
  const [bulkEditRows, setBulkEditRows] = useState<Account[] | null>(null);
  const [bulkCreate, setBulkCreate] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      return (await listAccounts()) as unknown as Account[];
    },
  });

  async function deleteAccount(a: Account) {
    if (!confirm(`Excluir a conta "${a.name}"? Os contatos vinculados também serão removidos.`))
      return;
    try {
      await deleteRecord({ data: { table: "accounts", id: a.id } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["accounts"] });
  }

  const fields: FieldDef[] = [
            { name: "name", label: "Nome da conta", required: true },
            { name: "type", label: "Tipo", type: "select", options: TIPOS },
            { name: "industry", label: "Setor" },
            { name: "city", label: "Cidade" },
            { name: "state", label: "Estado" },
            { name: "phone", label: "Telefone" },
            { name: "website", label: "Site" },
            { name: "account_owner", label: "Responsável" },
            { name: "revenue", label: "Faturamento anual", type: "number" },
            { name: "employees", label: "Funcionários", type: "number" },
            { name: "lifetime_value", label: "Valor de vida (LTV)", type: "number" },
            { name: "health", label: "Saúde", type: "select", options: SAUDE },
            { name: "customer_status", label: "Status", type: "select", options: STATUS },
            { name: "risk_level", label: "Risco", type: "select", options: RISCOS },
            { name: "branch_name", label: "Filial" },
            { name: "notes", label: "Observações", type: "textarea" },
          ];

  const columns: Column<Account>[] = [
    {
      key: "name",
      label: "Nome da conta",
      render: (a) => (
        <Link
          to="/accounts/$id"
          params={{ id: a.id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {a.name}
        </Link>
      ),
      sortValue: (a) => a.name,
      searchValue: (a) => a.name,
    },
    {
      key: "type",
      label: "Tipo",
      render: (a) => a.type,
      sortValue: (a) => a.type,
      filterOptions: TIPOS,
      filterValue: (a) => a.type,
    },
    {
      key: "industry",
      label: "Setor",
      render: (a) => a.industry ?? "—",
      sortValue: (a) => a.industry ?? "",
      searchValue: (a) => a.industry ?? "",
      filterOptions: Array.from(
        new Set(accounts.map((a) => a.industry).filter(Boolean) as string[]),
      ).sort(),
      filterValue: (a) => a.industry,
    },
    {
      key: "city",
      label: "Cidade",
      render: (a) => [a.city, a.state].filter(Boolean).join(", ") || "—",
      sortValue: (a) => a.city ?? "",
      searchValue: (a) => `${a.city ?? ""} ${a.state ?? ""}`,
    },
    {
      key: "owner",
      label: "Responsável",
      render: (a) => a.account_owner ?? "—",
      sortValue: (a) => a.account_owner ?? "",
      searchValue: (a) => a.account_owner ?? "",
      filterOptions: Array.from(
        new Set(accounts.map((a) => a.account_owner).filter(Boolean) as string[]),
      ).sort(),
      filterValue: (a) => a.account_owner,
    },
    {
      key: "branch",
      label: "Filial",
      render: (a) => a.branch_name ?? "—",
      sortValue: (a) => a.branch_name ?? "",
      filterOptions: Array.from(
        new Set(accounts.map((a) => a.branch_name).filter(Boolean) as string[]),
      ).sort(),
      filterValue: (a) => a.branch_name,
    },
    {
      key: "health",
      label: "Saúde",
      render: (a) => <HealthPill health={a.health as "Verde"} />,
      sortValue: (a) => a.health,
      filterOptions: SAUDE,
      filterValue: (a) => a.health,
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <StatusPill value={a.customer_status} />,
      sortValue: (a) => a.customer_status,
      filterOptions: STATUS,
      filterValue: (a) => a.customer_status,
    },
    {
      key: "risk",
      label: "Risco",
      render: (a) => a.risk_level,
      sortValue: (a) => a.risk_level,
      filterOptions: RISCOS,
      filterValue: (a) => a.risk_level,
    },
    {
      key: "ltv",
      label: "LTV",
      align: "right",
      render: (a) => fmtMoney(Number(a.lifetime_value)),
      sortValue: (a) => Number(a.lifetime_value),
    },
  ];

  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Contas</div>
          <h1 className="sf-ph-title">Todas as contas</h1>
          <div className="sf-ph-sub">{accounts.length} itens • Ordenado por nome da conta</div>
        </div>
        <div className="sf-ph-actions">
          <button className="sf-btn sf-btn--brand" onClick={() => setShowNew(true)}>
            Nova
          </button>
        </div>
      </div>

      <SfListView
        rows={accounts}
        columns={columns}
        rowKey={(a) => a.id}
        defaultSortKey="name"
        itemLabel="contas"
        searchPlaceholder="Pesquisar contas…"
        rightToolbar={
          <button
            className="sf-btn"
            onClick={() => qc.invalidateQueries({ queryKey: ["accounts"] })}
          >
            Atualizar
          </button>
        }
        bulkActions={[\n          { label: "Editar selecionados", onRun: (rows) => setBulkEditRows(rows) },\n          { label: "Exportar CSV", onRun: (rows) => exportCsv(rows, fields) },\n          { label: "Excluir selecionados", variant: "danger", onRun: async (rows) => {\n            if (!confirm(`Excluir ${rows.length} contas selecionadas? Os contatos vinculados também serão removidos.`)) return;\n            await Promise.all(rows.map((row) => deleteRecord({ data: { table: "accounts", id: row.id } })));\n            qc.invalidateQueries({ queryKey: ["accounts"] });\n          } },\n        ]}\n        rowActions={[
          { label: "Editar", onRun: (r) => setEditRow(r) },
          { label: "Excluir", onRun: deleteAccount },
        ]}
      />

      {bulkCreate && (
        <SfBulkRecordDialog table="accounts" fields={fields} defaults={{}} onClose={() => setBulkCreate(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["accounts"] })} />
      )}
      {bulkEditRows && (
        <SfBulkRecordDialog table="accounts" fields={fields} defaults={{}} rows={bulkEditRows} onClose={() => setBulkEditRows(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["accounts"] })} />
      )}
      {(showNew || editRow) && (
        <SfRecordDialog
          title={editRow ? `Editar ${editRow.name}` : "Nova conta"}
          table="accounts"
          recordId={editRow?.id}
          onClose={() => {
            setShowNew(false);
            setEditRow(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["accounts"] })}
          defaults={{
            name: editRow?.name ?? "",
            type: editRow?.type ?? "Cliente - Direto",
            industry: editRow?.industry ?? "",
            city: editRow?.city ?? "",
            state: editRow?.state ?? "",
            phone: editRow?.phone ?? "",
            website: editRow?.website ?? "",
            account_owner: editRow?.account_owner ?? "",
            revenue: editRow?.revenue ?? 0,
            employees: editRow?.employees ?? 0,
            lifetime_value: editRow?.lifetime_value ?? 0,
            health: editRow?.health ?? "Verde",
            customer_status: editRow?.customer_status ?? "Prospecção",
            risk_level: editRow?.risk_level ?? "Baixo",
            branch_name: editRow?.branch_name ?? "",
            notes: editRow?.notes ?? "",
          }}
          fields={fields}
        />
      )}
    </SfShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { listContactsWithAccount, listAccountOptions, deleteRecord } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
import { SfRecordDialog, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";
import { exportCsv } from "@/lib/csv";
import { PAPEIS } from "@/lib/options";

type Row = {
  id: string;
  name: string;
  title: string | null;
  account_id: string;
  email: string | null;
  phone: string | null;
  decision_role: string | null;
  account_name: string;
};

export const Route = createFileRoute("/contacts/")({
  head: () => ({
    meta: [
      { title: "Contatos | CRM" },
      { name: "description", content: "Todos os contatos cadastrados no CRM." },
      { property: "og:title", content: "Contatos | CRM" },
      { property: "og:description", content: "Todos os contatos cadastrados no CRM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactsPage,
});

function ContactsPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [bulkEditRows, setBulkEditRows] = useState<Row[] | null>(null);
  const [bulkCreate, setBulkCreate] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["contacts-with-acc"],
    queryFn: async () => {
      return (await listContactsWithAccount()) as unknown as Row[];
    },
  });

  const { data: accountList = [] } = useQuery({
    queryKey: ["accounts-min"],
    queryFn: async () => {
      return (await listAccountOptions()) as { id: string; name: string }[];
    },
  });

  async function deleteContact(c: Row) {
    if (!confirm(`Excluir o contato "${c.name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await deleteRecord({ data: { table: "contacts", id: c.id } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao excluir.");
      return;
    }
    qc.invalidateQueries({ queryKey: ["contacts-with-acc"] });
  }

  const accountOptions = Array.from(new Set(data.map((r) => r.account_name))).sort();

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Nome",
      render: (r) => (
        <Link
          to="/contacts/$id"
          params={{ id: r.id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {r.name}
        </Link>
      ),
      sortValue: (r) => r.name,
      searchValue: (r) => r.name,
    },
    {
      key: "title",
      label: "Cargo",
      render: (r) => r.title ?? "—",
      sortValue: (r) => r.title ?? "",
      searchValue: (r) => r.title ?? "",
    },
    {
      key: "account",
      label: "Conta",
      render: (r) => (
        <Link
          to="/accounts/$id"
          params={{ id: r.account_id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {r.account_name}
        </Link>
      ),
      sortValue: (r) => r.account_name,
      searchValue: (r) => r.account_name,
      filterOptions: accountOptions,
      filterValue: (r) => r.account_name,
    },
    {
      key: "email",
      label: "E-mail",
      render: (r) => r.email ?? "—",
      sortValue: (r) => r.email ?? "",
      searchValue: (r) => r.email ?? "",
    },
    {
      key: "phone",
      label: "Telefone",
      render: (r) => r.phone ?? "—",
      sortValue: (r) => r.phone ?? "",
    },
    {
      key: "role",
      label: "Papel na decisão",
      render: (r) => r.decision_role ?? "—",
      sortValue: (r) => r.decision_role ?? "",
      filterOptions: PAPEIS,
      filterValue: (r) => r.decision_role,
    },
  ];

  const accountNameToId = new Map(accountList.map((a) => [a.name, a.id]));
  const fields: FieldDef[] = [
            { name: "name", label: "Nome", required: true },
            { name: "title", label: "Cargo" },
            { name: "email", label: "E-mail" },
            { name: "phone", label: "Telefone" },
            { name: "decision_role", label: "Papel na decisão", type: "select", options: PAPEIS },
            {
              name: "account_name",
              label: "Conta",
              type: "select",
              required: true,
              options: accountList.map((a) => a.name),
            },
          ];

  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Contatos</div>
          <h1 className="sf-ph-title">Todos os contatos</h1>
          <div className="sf-ph-sub">{data.length} itens</div>
        </div>
        <div className="sf-ph-actions">
          <button className="sf-btn" onClick={() => setBulkCreate(true)}>Criar em lote</button>
          <button className="sf-btn sf-btn--brand" onClick={() => setShowNew(true)}>
            Novo
          </button>
        </div>
      </div>

      <SfListView
        rows={data}
        columns={columns}
        rowKey={(r) => r.id}
        defaultSortKey="name"
        itemLabel="contatos"
        searchPlaceholder="Pesquisar contatos…"
        bulkActions={[
          { label: "Editar selecionados", onRun: (rows) => setBulkEditRows(rows) },
          { label: "Exportar CSV", onRun: (rows) => exportCsv(rows, fields) },
          { label: "Excluir selecionados", variant: "danger", onRun: async (rows) => {
            if (!confirm(`Excluir ${rows.length} contatos selecionados? Esta ação não pode ser desfeita.`)) return;
            await Promise.all(rows.map((row) => deleteRecord({ data: { table: "contacts", id: row.id } })));
            qc.invalidateQueries({ queryKey: ["contacts-with-acc"] });
          } },
        ]}
        rowActions={[
          { label: "Editar", onRun: (r) => setEditRow(r) },
          { label: "Excluir", onRun: deleteContact },
        ]}
      />

      {bulkCreate && (
        <SfBulkRecordDialog table="contacts" fields={fields} defaults={{}} transform={(form) => {
          const { account_name, ...rest } = form;
          return { ...rest, account_id: accountNameToId.get(account_name) };
        }} onClose={() => setBulkCreate(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["contacts-with-acc"] })} />
      )}
      {bulkEditRows && (
        <SfBulkRecordDialog table="contacts" fields={fields} defaults={{}} rows={bulkEditRows} transform={(form) => {
          const { account_name, ...rest } = form;
          return { ...rest, account_id: accountNameToId.get(account_name) };
        }} onClose={() => setBulkEditRows(null)} onSaved={() => qc.invalidateQueries({ queryKey: ["contacts-with-acc"] })} />
      )}
      {(showNew || editRow) && (
        <SfRecordDialog
          title={editRow ? `Editar ${editRow.name}` : "Novo contato"}
          table="contacts"
          recordId={editRow?.id}
          onClose={() => {
            setShowNew(false);
            setEditRow(null);
          }}
          onSaved={() => qc.invalidateQueries({ queryKey: ["contacts-with-acc"] })}
          defaults={{
            name: editRow?.name ?? "",
            title: editRow?.title ?? "",
            email: editRow?.email ?? "",
            phone: editRow?.phone ?? "",
            decision_role: editRow?.decision_role ?? "",
            account_name: editRow?.account_name ?? "",
          }}
          fields={fields}
          transform={(f) => {
            const { account_name, ...rest } = f;
            return { ...rest, account_id: accountNameToId.get(account_name) };
          }}
        />
      )}
    </SfShell>
  );
}

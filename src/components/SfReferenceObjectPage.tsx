import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  deleteRecord,
  deleteRecordsBulk,
  getReferenceRecord,
  listReferenceRecords,
} from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
import { SfRecordDialog, SfDeleteButton, type FieldDef } from "@/components/SfRecordDialog";
import { SfBulkRecordDialog } from "@/components/SfBulkRecordDialog";

type Config = { table: string; label: string; fields: FieldDef[]; columns: string[] };
const CONFIG: Record<string, Config> = {
  locations: {
    table: "locations",
    label: "Locations",
    fields: [
      { name: "name", label: "Nome", required: true },
      { name: "code", label: "Sigla", required: true },
      { name: "city", label: "Cidade", required: true },
      { name: "state", label: "Estado", required: true },
      { name: "microregion", label: "Microrregião", required: true },
      { name: "location_type", label: "Tipo", type: "select", options: ["Pátio", "Terminal"] },
    ],
    columns: ["code", "name", "city", "state", "microregion", "location_type"],
  },
  merchandise: {
    table: "merchandise",
    label: "Mercadorias",
    fields: [
      { name: "name", label: "Mercadoria", required: true },
      { name: "unit", label: "Unidade de medida", type: "select", options: ["M³", "TON"] },
    ],
    columns: ["name", "unit"],
  },
  diesel_bases: {
    table: "diesel_bases",
    label: "Bases Diesel",
    fields: [
      { name: "name", label: "Nome da base", required: true },
      { name: "anp_base", label: "Base ANP (1 = Sim, 0 = Não)", type: "number" },
    ],
    columns: ["name", "anp_base"],
  },
  planned_flows: {
    table: "planned_flows",
    label: "Fluxos Planejados",
    fields: [
      { name: "code", label: "Código do fluxo", required: true },
      { name: "account_id", label: "ID da Conta", required: true },
      { name: "origin_id", label: "ID do Location de origem", required: true },
      { name: "destination_id", label: "ID do Location de destino", required: true },
      { name: "merchandise_id", label: "ID da Mercadoria", required: true },
      { name: "modal", label: "Modal", type: "select", options: ["Ferroviário"] },
      { name: "origin_system", label: "Origem do cadastro", type: "select", options: ["FLOU"] },
    ],
    columns: [
      "code",
      "account_name",
      "origin_label",
      "destination_label",
      "merchandise_label",
      "modal",
      "origin_system",
    ],
  },
  approvers: {
    table: "approvers",
    label: "Aprovadores",
    fields: [
      { name: "name", label: "Nome do aprovador", required: true },
      {
        name: "level",
        label: "Nível de alçada",
        type: "select",
        options: ["Gerente Geral", "Diretoria"],
        required: true,
      },
      { name: "email", label: "E-mail" },
    ],
    columns: ["name", "level", "email"],
  },
  recommended_prices: {
    table: "recommended_prices",
    label: "Preços Recomendados",
    fields: [
      { name: "planned_flow_id", label: "ID do Fluxo Planejado", required: true },
      {
        name: "service",
        label: "Serviço",
        type: "select",
        options: ["FRETE", "CARGA", "DESCARGA", "BALDEAÇÃO", "MANOBRA ORIGEM", "MANOBRA DESTINO"],
        required: true,
      },
      { name: "year", label: "Ano", type: "number", required: true },
      { name: "month", label: "Mês (1–12)", type: "number", required: true },
      {
        name: "unit_price",
        label: "Preço unitário recomendado",
        type: "number",
        required: true,
      },
    ],
    columns: ["flow_code", "service", "year", "month", "unit_price", "source"],
  },
};
export function SfReferenceObjectPage({ object, id }: { object: string; id?: string }) {
  const config = CONFIG[object],
    qc = useQueryClient();
  const [create, setCreate] = useState(false),
    [edit, setEdit] = useState<any>(null),
    [bulk, setBulk] = useState(false),
    [bulkEdit, setBulkEdit] = useState<any[] | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["ref-object", object],
    enabled: !id && !!config,
    queryFn: async () => (await listReferenceRecords({ data: { table: config!.table } })) as any[],
  });
  const { data: record, isLoading } = useQuery({
    queryKey: ["ref-record", object, id],
    enabled: !!id && !!config,
    queryFn: async () =>
      (await getReferenceRecord({ data: { table: config!.table, id: id! } })) as any,
  });
  if (!config)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Objeto não encontrado.</div>
      </SfShell>
    );
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["ref-object", object] });
    await qc.invalidateQueries({ queryKey: ["ref-record", object, id] });
  };
  if (id) {
    if (isLoading)
      return (
        <SfShell>
          <div style={{ padding: 24 }}>Carregando registro…</div>
        </SfShell>
      );
    if (!record)
      return (
        <SfShell>
          <div style={{ padding: 24 }}>
            Registro não encontrado. <Link to={`/${object}` as any}>Voltar</Link>
          </div>
        </SfShell>
      );
    return (
      <SfShell>
        <div className="sf-page-header">
          <div>
            <div className="sf-ph-eyebrow">{config.label}</div>
            <h1 className="sf-ph-title">{record.name ?? record.code}</h1>
            <div className="sf-ph-sub">
              Registro relacionado usado no cadastro de Cotações ferroviárias.
            </div>
          </div>
          <div className="sf-ph-actions">
            <Link className="sf-btn" to={`/${object}` as any}>
              Voltar à lista
            </Link>
            <button className="sf-btn sf-btn--brand" onClick={() => setEdit(record)}>
              Editar
            </button>
            <SfDeleteButton table={config.table} id={id} redirectTo={`/${object}`} />
          </div>
        </div>
        <div className="sf-card" style={{ padding: 18 }}>
          <div className="sf-fields">
            {config.fields.map((field) => (
              <Field
                key={field.name}
                label={field.label}
                value={record[field.name] == null ? "—" : String(record[field.name])}
              />
            ))}
            {record.route && <Field label="Rota" value={record.route} />}
            {record.origin_label && <Field label="Origem" value={record.origin_label} />}{" "}
            {record.destination_label && <Field label="Destino" value={record.destination_label} />}{" "}
            {record.account_name && <Field label="Conta de gestão" value={record.account_name} />}{" "}
            {record.merchandise_label && (
              <Field label="Mercadoria" value={`${record.merchandise_label} · ${record.unit}`} />
            )}
          </div>
        </div>
        {edit && (
          <SfRecordDialog
            title={`Editar ${config.label}`}
            table={config.table}
            recordId={id}
            fields={config.fields}
            defaults={record}
            onClose={() => setEdit(null)}
            onSaved={refresh}
          />
        )}
      </SfShell>
    );
  }
  const columns: Column<any>[] = config.columns.map((key) => ({
    key,
    label: key === "code" ? "Sigla / código" : key.replaceAll("_", " "),
    render: (row) => (
      <Link
        to={`/${object}/$id` as any}
        params={{ id: row.id } as any}
        style={{ color: "#0176d3", fontWeight: key === "code" || key === "name" ? 600 : 400 }}
      >
        {String(row[key] ?? "—")}
      </Link>
    ),
    sortValue: (row) => String(row[key] ?? ""),
    searchValue: (row) => String(row[key] ?? ""),
  }));
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Cadastros ferroviários</div>
          <h1 className="sf-ph-title">{config.label}</h1>
          <div className="sf-ph-sub">Cadastros de referência ligados às Contas e às Agendas.</div>
        </div>
        <div className="sf-ph-actions">
          <button className="sf-btn" onClick={() => setBulk(true)}>
            Criar em lote
          </button>
          <button className="sf-btn sf-btn--brand" onClick={() => setCreate(true)}>
            Novo registro
          </button>
        </div>
      </div>
      <SfListView
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        itemLabel={config.label.toLowerCase()}
        objectKey={config.table}
        bulkActions={[
          { label: "Editar selecionados", onRun: setBulkEdit },
          {
            label: "Excluir selecionados",
            variant: "danger",
            onRun: async (selected) => {
              if (confirm(`Excluir ${selected.length} registros?`)) {
                await deleteRecordsBulk({
                  data: { table: config.table, ids: selected.map((r) => r.id) },
                });
                await refresh();
              }
            },
          },
        ]}
        rowActions={[
          { label: "Editar", onRun: setEdit },
          {
            label: "Excluir",
            onRun: async (row) => {
              if (confirm(`Excluir ${row.name ?? row.code}?`)) {
                await deleteRecord({ data: { table: config.table, id: row.id } });
                await refresh();
              }
            },
          },
        ]}
      />
      {create && (
        <SfRecordDialog
          title={`Novo registro: ${config.label}`}
          table={config.table}
          fields={config.fields}
          defaults={{ modal: "Ferroviário", origin_system: "FLOU", anp_base: 0 }}
          onClose={() => setCreate(false)}
          onSaved={refresh}
        />
      )}
      {edit && (
        <SfRecordDialog
          title={`Editar ${edit.name ?? edit.code}`}
          table={config.table}
          recordId={edit.id}
          fields={config.fields}
          defaults={edit}
          onClose={() => setEdit(null)}
          onSaved={refresh}
        />
      )}
      {bulk && (
        <SfBulkRecordDialog
          table={config.table}
          fields={config.fields}
          defaults={{ modal: "Ferroviário", origin_system: "FLOU", anp_base: 0 }}
          onClose={() => setBulk(false)}
          onSaved={refresh}
        />
      )}
      {bulkEdit && (
        <SfBulkRecordDialog
          table={config.table}
          fields={config.fields}
          rows={bulkEdit}
          defaults={{}}
          onClose={() => setBulkEdit(null)}
          onSaved={refresh}
        />
      )}
    </SfShell>
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

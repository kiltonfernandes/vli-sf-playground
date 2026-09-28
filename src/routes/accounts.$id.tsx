import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getAccountFull, listAccountOpportunities } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfRelatedLists, type RelatedListDefinition } from "@/components/SfRelatedLists";
import type { Column } from "@/components/SfListView";
import type { FieldDef } from "@/components/SfRecordDialog";
import { SfDeleteButton, SfRecordDialog } from "@/components/SfRecordDialog";
import { fmtMoney, fmtDate, HealthPill, RiskPill, StatusPill } from "@/lib/format";
import { PAPEIS } from "@/lib/options";

export const Route = createFileRoute("/accounts/$id")({
  head: () => ({
    meta: [
      { title: "Conta | CRM" },
      { name: "description", content: "Detalhes da conta." },
      { property: "og:title", content: "Conta | CRM" },
      { property: "og:description", content: "Detalhes da conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountDetailPage,
});

type Tab = "Visão geral" | "Detalhes" | "Contatos";
const TABS: Tab[] = ["Visão geral", "Detalhes", "Contatos"];

const ACCOUNT_RELATED_LISTS: RelatedListDefinition[] = [
  {
    key: "contacts",
    label: "Contatos",
    table: "contacts",
    load: async (parentId) => {
      const result = await getAccountFull({ data: { id: parentId } });
      return (result?.contacts ?? []).map((contact) => ({
        ...contact,
        account_name: result?.account?.name ?? "—",
      }));
    },
    columns: [
      {
        key: "name",
        label: "Nome",
        render: (row) => <Link to="/contacts/$id" params={{ id: row.id }} style={{ color: "#0176d3", fontWeight: 600 }}>{row.name}</Link>,
        sortValue: (row) => row.name,
        searchValue: (row) => row.name,
      },
      { key: "title", label: "Cargo", render: (row) => row.title ?? "—", sortValue: (row) => row.title ?? "" },
      { key: "account_name", label: "Conta", render: (row) => row.account_name, sortValue: (row) => row.account_name },
    ] as Column<any>[],
    fields: [
      { name: "name", label: "Nome", required: true },
      { name: "title", label: "Cargo" },
      { name: "email", label: "E-mail" },
      { name: "phone", label: "Telefone" },
      { name: "decision_role", label: "Papel na decisão", type: "select", options: PAPEIS },
    ] as FieldDef[],
    createDefaults: () => ({ name: "", title: "", email: "", phone: "", decision_role: "" }),
    rowDefaults: (row) => ({ name: row.name ?? "", title: row.title ?? "", email: row.email ?? "", phone: row.phone ?? "", decision_role: row.decision_role ?? "" }),
    transform: (form, parentId) => ({ ...form, account_id: parentId }),
    refreshKeys: (parentId) => [["account-full", parentId], ["contacts-with-acc"]],
    defaultVisible: true,
  },

  {
    key: "opportunities",
    label: "Oportunidades",
    table: "opportunities",
    load: (parentId) => listAccountOpportunities({ data: { accountId: parentId } }),
    columns: [
      { key: "name", label: "Oportunidade", render: (row) => row.name, sortValue: (row) => row.name, searchValue: (row) => row.name },
      { key: "stage", label: "Estágio", render: (row) => row.stage, sortValue: (row) => row.stage },
      { key: "amount", label: "Valor", render: (row) => fmtMoney(Number(row.amount)), sortValue: (row) => Number(row.amount), align: "right" },
    ] as Column<any>[],
    fields: [
      { name: "name", label: "Nome da oportunidade", required: true },
      { name: "instrument_type", label: "Tipo de instrumento", type: "select", options: ["Contrato", "ACS", "Aditivo", "Outros Serviços"] },
      { name: "stage", label: "Estágio", type: "select", options: ["Prospecção", "Negociação", "Aprovação", "Formalização", "Fechado"] },
      { name: "segment", label: "Segmento", type: "select", options: ["Ferroviário", "Portuário", "Rodoviário"] },
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
    ] as FieldDef[],
    createDefaults: () => ({ name: "", instrument_type: "Contrato", stage: "Prospecção", segment: "", amount: 0, close_date: "", contract_start: "", contract_end: "", diesel_pct: 0, igpm_pct: 100, ipca_pct: 0, contracting_parties: "", vli_entity: "VLI Multimodal S.A.", joint_debtor: "", integration_tariff: "Líquida", take_or_pay: false }),
    rowDefaults: (row) => ({ name: row.name ?? "", instrument_type: row.instrument_type ?? "Contrato", stage: row.stage ?? "Prospecção", segment: row.segment ?? "", amount: row.amount ?? 0, close_date: row.close_date ?? "", contract_start: row.contract_start ?? "", contract_end: row.contract_end ?? "", diesel_pct: row.diesel_pct ?? 0, igpm_pct: row.igpm_pct ?? 0, ipca_pct: row.ipca_pct ?? 0, contracting_parties: row.contracting_parties ?? "", vli_entity: row.vli_entity ?? "", joint_debtor: row.joint_debtor ?? "", integration_tariff: row.integration_tariff ?? "Líquida", take_or_pay: !!row.take_or_pay }),
    transform: (form, parentId) => ({ ...form, account_id: parentId, take_or_pay: form.take_or_pay ? 1 : 0 }),
    refreshKeys: (parentId) => [["account-full", parentId], ["opportunities"]],
    defaultVisible: true,
  },
];

function AccountDetailPage() {
  const { id } = Route.useParams();
  const [tab, setTab] = useState<Tab>("Visão geral");
  const [showNewContact, setShowNewContact] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["account-full", id],
    queryFn: async () => {
      return await getAccountFull({ data: { id } });
    },
  });

  if (isLoading) {
    return (
      <SfShell>
        <div style={{ padding: 32 }}>Carregando conta…</div>
      </SfShell>
    );
  }

  const a = data?.account;
  if (!a) {
    return (
      <SfShell>
        <div style={{ padding: 32 }}>
          Conta não encontrada.{" "}
          <Link to="/accounts" style={{ color: "#0176d3" }}>
            Voltar
          </Link>
        </div>
      </SfShell>
    );
  }

  const contacts = data!.contacts;
  const opportunities = data!.opportunities ?? [];
  const opportunityTotal = opportunities.reduce((total, opportunity) => total + Number(opportunity.amount ?? 0), 0);

  return (
    <SfShell>
      <div
        className="sf-page-header"
        style={{ display: "flex", gap: 16, alignItems: "flex-start" }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div>
            <div className="sf-ph-eyebrow">Conta</div>
            <h1 className="sf-ph-title">{a.name}</h1>
            <div className="sf-ph-sub">
              {a.type} • {a.industry ?? "—"} • {[a.city, a.state].filter(Boolean).join(", ") || "—"}{" "}
              • {a.branch_name ?? "—"}
            </div>
          </div>
        </div>
        <div className="sf-ph-actions" style={{ marginLeft: "auto", flexWrap: "wrap" }}>
          <Link to="/accounts" className="sf-btn">
            ← Voltar
          </Link>
          <SfDeleteButton table="accounts" id={id} redirectTo="/accounts" />
          <button className="sf-btn sf-btn--brand" onClick={() => setShowNewContact(true)}>
            Novo contato
          </button>
        </div>
      </div>

      <div className="sf-highlights">
        <Highlight label="Responsável" value={a.account_owner ?? "—"} />
        <Highlight label="Status">
          <StatusPill value={String(a.customer_status)} />
        </Highlight>
        <Highlight label="Nível de risco">
          <RiskPill value={String(a.risk_level)} />
        </Highlight>
        <Highlight label="Saúde">
          <HealthPill health={a.health as "Verde"} />
        </Highlight>
        <Highlight label="Valor de vida" value={fmtMoney(Number(a.lifetime_value))} />
        <Highlight label="Valor em oportunidades" value={fmtMoney(opportunityTotal)} />
        <Highlight label="Faturamento anual" value={fmtMoney(Number(a.revenue))} />
        <Highlight label="Funcionários" value={String(a.employees ?? 0)} />
        <Highlight label="Criada em" value={fmtDate(a.created_at)} />
      </div>

      <div className="sf-tabs-bar">
        {TABS.map((t) => (
          <button
            key={t}
            className={`sf-tab ${tab === t ? "sf-tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: 24,
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(300px, 1fr)",
          gap: 16,
        }}
      >
        {tab === "Visão geral" && (
          <>
            <div style={{ display: "grid", gap: 16 }}>
              <Card title="Sobre esta conta">
                <div className="sf-fields">
                  <Field label="Setor" value={a.industry ?? "—"} />
                  <Field label="Tipo" value={a.type} />
                  <Field label="Telefone" value={a.phone ?? "—"} />
                  <Field label="Site" value={a.website ?? "—"} />
                  <Field label="Filial" value={a.branch_name ?? "—"} />
                  <Field label="Responsável" value={a.account_owner ?? "—"} />
                </div>
                {a.notes && (
                  <div
                    style={{ padding: "12px 16px", borderTop: "1px solid #f3f3f3", fontSize: 13 }}
                  >
                    {a.notes}
                  </div>
                )}
              </Card>
              
            </div>
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              <Card title="Resumo">
                <div className="sf-fields">
                  <Field label="Contatos" value={String(contacts.length)} />
                  <Field label="Oportunidades" value={String(opportunities.length)} />
                  <Field label="Valor das oportunidades" value={fmtMoney(opportunityTotal)} />
                  <Field label="Valor de vida" value={fmtMoney(Number(a.lifetime_value))} />
                  <Field label="Faturamento anual" value={fmtMoney(Number(a.revenue))} />
                </div>
              </Card>
              <SfRelatedLists objectType="accounts" parentId={id} definitions={ACCOUNT_RELATED_LISTS} />
            </div>
          </>
        )}

        {tab === "Detalhes" && (
          <Card title="Detalhes da conta">
            <div className="sf-fields">
              <Field label="Nome" value={a.name} />
              <Field label="Tipo" value={a.type} />
              <Field label="Setor" value={a.industry ?? "—"} />
              <Field label="Cidade" value={a.city ?? "—"} />
              <Field label="Estado" value={a.state ?? "—"} />
              <Field label="Telefone" value={a.phone ?? "—"} />
              <Field label="Site" value={a.website ?? "—"} />
              <Field label="Responsável" value={a.account_owner ?? "—"} />
              <Field label="Funcionários" value={String(a.employees ?? 0)} />
              <Field label="Faturamento anual" value={fmtMoney(Number(a.revenue))} />
              <Field label="Valor de vida" value={fmtMoney(Number(a.lifetime_value))} />
              <Field label="Saúde" value={a.health} />
              <Field label="Status" value={a.customer_status} />
              <Field label="Risco" value={a.risk_level} />
              <Field label="Filial" value={a.branch_name ?? "—"} />
              <Field label="Observações" value={a.notes ?? "—"} />
            </div>
          </Card>
        )}

        {tab === "Contatos" && (
          <Card title={`Contatos (${contacts.length})`}>
            <ContactsTable rows={contacts} />
          </Card>
        )}

        {tab !== "Visão geral" && <SfRelatedLists objectType="accounts" parentId={id} definitions={ACCOUNT_RELATED_LISTS} />}
      </div>

      {showNewContact && (
        <SfRecordDialog
          title="Novo contato"
          table="contacts"
          onClose={() => setShowNewContact(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["account-full", id] })}
          defaults={{ name: "", title: "", email: "", phone: "", decision_role: "" }}
          fields={[
            { name: "name", label: "Nome", required: true },
            { name: "title", label: "Cargo" },
            { name: "email", label: "E-mail" },
            { name: "phone", label: "Telefone" },
            { name: "decision_role", label: "Papel na decisão", type: "select", options: PAPEIS },
          ]}
          transform={(f) => ({ ...f, account_id: id })}
        />
      )}
    </SfShell>
  );
}

function ContactsTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) {
    return <div style={{ padding: 16, color: "#706e6b", fontSize: 13 }}>Nenhum contato.</div>;
  }
  return (
    <table className="sf-table">
      <thead>
        <tr>
          <th>Nome</th>
          <th>Cargo</th>
          <th>E-mail</th>
          <th>Telefone</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td>
              <Link
                to="/contacts/$id"
                params={{ id: c.id }}
                style={{ color: "#0176d3", fontWeight: 600 }}
              >
                {c.name}
              </Link>
            </td>
            <td>{c.title ?? "—"}</td>
            <td>{c.email ?? "—"}</td>
            <td>{c.phone ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Highlight({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="sf-highlight">
      <div className="sf-highlight-label">{label}</div>
      <div className="sf-highlight-value">{children ?? value}</div>
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

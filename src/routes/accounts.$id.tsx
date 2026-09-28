import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getAccountFull } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
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
          gridTemplateColumns: tab === "Visão geral" ? "2fr 1fr" : "1fr",
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
              <Card title={`Contatos (${contacts.length})`}>
                <ContactsTable rows={contacts} />
              </Card>
            </div>
            <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
              <Card title="Resumo">
                <div className="sf-fields">
                  <Field label="Contatos" value={String(contacts.length)} />
                  <Field label="Valor de vida" value={fmtMoney(Number(a.lifetime_value))} />
                  <Field label="Faturamento anual" value={fmtMoney(Number(a.revenue))} />
                </div>
              </Card>
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

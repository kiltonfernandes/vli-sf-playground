import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getContactFull } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfDeleteButton } from "@/components/SfRecordDialog";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/contacts/$id")({
  head: () => ({
    meta: [
      { title: "Contato | CRM" },
      { name: "description", content: "Detalhes do contato." },
      { property: "og:title", content: "Contato | CRM" },
      { property: "og:description", content: "Detalhes do contato." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ContactDetailPage,
});

function ContactDetailPage() {
  const { id } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["contact-full", id],
    queryFn: async () => {
      return await getContactFull({ data: { id } });
    },
  });

  if (isLoading) {
    return (
      <SfShell>
        <div style={{ padding: 32 }}>Carregando contato…</div>
      </SfShell>
    );
  }
  if (!data?.contact) {
    return (
      <SfShell>
        <div style={{ padding: 32 }}>
          Contato não encontrado.{" "}
          <Link to="/contacts" style={{ color: "#0176d3" }}>
            Voltar
          </Link>
        </div>
      </SfShell>
    );
  }

  const c = data.contact;
  const a = data.account;

  return (
    <SfShell>
      <div className="sf-page-header" style={{ display: "flex", gap: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div>
            <div className="sf-ph-eyebrow">Contato</div>
            <h1 className="sf-ph-title">{c.name}</h1>
            <div className="sf-ph-sub">
              {c.title ?? "—"}{" "}
              {a && (
                <>
                  •{" "}
                  <Link to="/accounts/$id" params={{ id: a.id }} style={{ color: "#0176d3" }}>
                    {a.name}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="sf-ph-actions" style={{ marginLeft: "auto" }}>
          <Link to="/contacts" className="sf-btn">
            ← Voltar
          </Link>
          <SfDeleteButton table="contacts" id={id} redirectTo="/contacts" />
        </div>
      </div>

      <div className="sf-highlights">
        <Hi label="Conta" value={a?.name ?? "—"} />
        <Hi label="Cargo" value={c.title ?? "—"} />
        <Hi label="Papel na decisão" value={c.decision_role ?? "—"} />
        <Hi label="E-mail" value={c.email ?? "—"} />
        <Hi label="Telefone" value={c.phone ?? "—"} />
        <Hi label="Criado em" value={fmtDate(c.created_at)} />
      </div>

      <div style={{ padding: 24, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <Card title="Informações do contato">
          <div className="sf-fields">
            <Field label="Nome" value={c.name} />
            <Field label="Cargo" value={c.title ?? "—"} />
            <Field label="E-mail" value={c.email ?? "—"} />
            <Field label="Telefone" value={c.phone ?? "—"} />
            <Field label="Papel na decisão" value={c.decision_role ?? "—"} />
            <Field label="Conta" value={a?.name ?? "—"} />
          </div>
        </Card>
        <Card title="Conta">
          {a ? (
            <div className="sf-fields">
              <Field label="Nome" value={a.name} />
              <Field label="Setor" value={a.industry ?? "—"} />
              <Field label="Local" value={[a.city, a.state].filter(Boolean).join(", ") || "—"} />
            </div>
          ) : (
            <div style={{ padding: 16, color: "#706e6b" }}>Sem conta vinculada.</div>
          )}
        </Card>
      </div>
    </SfShell>
  );
}

function Hi({ label, value }: { label: string; value: string }) {
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

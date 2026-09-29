import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getQuoteLineItemFull } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfDeleteButton } from "@/components/SfRecordDialog";
export const Route = createFileRoute("/quote-line-items/$id")({
  head: () => ({ meta: [{ title: "Item da Cotação | CRM" }] }),
  component: Page,
});
function Page() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["quote-item-full", id],
    queryFn: () => getQuoteLineItemFull({ data: { id } }) as Promise<any>,
  });
  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Carregando Item…</div>
      </SfShell>
    );
  if (!data)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Item não encontrado.</div>
      </SfShell>
    );
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Item da Cotação · {data.quote_number}</div>
          <h1 className="sf-ph-title">
            {data.route} · {data.merchandise_name} · {data.service}
          </h1>
          <div className="sf-ph-sub">
            Fluxo {data.flow_code} · {data.unit}
          </div>
        </div>
        <div className="sf-ph-actions">
          <Link className="sf-btn" to="/quotes/$id" params={{ id: data.quote_id }}>
            Voltar à Cotação
          </Link>
          <SfDeleteButton
            table="quote_line_items"
            id={id}
            redirectTo={`/quotes/${data.quote_id}`}
          />
        </div>
      </div>
      <div className="sf-card" style={{ padding: 18 }}>
        <h2>Detalhes do Item</h2>
        <div className="sf-fields">
          <Field label="Fluxo planejado" value={data.flow_code} />
          <Field label="Rota" value={data.route} />
          <Field label="Mercadoria" value={data.merchandise_name} />
          <Field label="Serviço" value={data.service} />
          <Field label="Cotação" value={data.quote_number} />
          <Field label="Agendas" value={String(data.schedules.length)} />
        </div>
      </div>
      <div className="sf-card" style={{ marginTop: 16, padding: 18 }}>
        <h2>Agendas relacionadas</h2>
        {data.schedules.map((s: any) => (
          <div key={s.id} style={{ padding: 10, borderTop: "1px solid #eee" }}>
            <Link to="/quote-schedules/$id" params={{ id: s.id }} style={{ color: "#0176d3" }}>
              {s.schedule_key}
            </Link>{" "}
            · {String(s.month).padStart(2, "0")}/{s.year} · {s.volume.toLocaleString("pt-BR")}{" "}
            {data.unit}
          </div>
        ))}
      </div>
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

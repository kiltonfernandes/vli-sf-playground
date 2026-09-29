import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getQuoteScheduleFull } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfDeleteButton } from "@/components/SfRecordDialog";
import { fmtMoney } from "@/lib/format";
export const Route = createFileRoute("/quote-schedules/$id")({
  head: () => ({ meta: [{ title: "Agenda da Cotação | CRM" }] }),
  component: Page,
});
function Page() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["quote-schedule-full", id],
    queryFn: () => getQuoteScheduleFull({ data: { id } }) as Promise<any>,
  });
  if (isLoading)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Carregando Agenda…</div>
      </SfShell>
    );
  if (!data)
    return (
      <SfShell>
        <div style={{ padding: 24 }}>Agenda não encontrada.</div>
      </SfShell>
    );
  const fields: [string, string][] = [
    ["Chave funcional", data.schedule_key],
    ["Fluxo", data.flow_code],
    ["Rota", data.route],
    ["Período", `${String(data.month).padStart(2, "0")}/${data.year} · ${data.period_window}`],
    ["Periodicidade", data.frequency],
    ["Divisão / praça", `${data.division} · ${data.plaza}`],
    ["Volume", Number(data.volume).toLocaleString("pt-BR")],
    ["Tarifa CBS", data.tariff_cbs == null ? "—" : fmtMoney(Number(data.tariff_cbs))],
    ["Tarifa líquida", fmtMoney(Number(data.tariff_net))],
    ["Serviço", data.service],
    ["Base Diesel", data.diesel_base_name],
    ["Data base Diesel", data.diesel_base_date ?? "—"],
    [
      "Tarifa acessória líquida",
      data.accessory_net == null ? "—" : fmtMoney(Number(data.accessory_net)),
    ],
    [
      "Percentual acessório",
      data.accessory_net_pct == null ? "—" : `${Number(data.accessory_net_pct).toFixed(2)}%`,
    ],
  ];
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Agenda da Cotação · {data.quote_number}</div>
          <h1 className="sf-ph-title">{data.schedule_key}</h1>
          <div className="sf-ph-sub">
            {data.route} · {data.service}
          </div>
        </div>
        <div className="sf-ph-actions">
          <Link className="sf-btn" to="/quotes/$id" params={{ id: data.quote_id }}>
            Abrir Cotação
          </Link>
          <SfDeleteButton table="quote_schedules" id={id} redirectTo={`/quotes/${data.quote_id}`} />
        </div>
      </div>
      <div className="sf-card" style={{ padding: 18 }}>
        <h2>Detalhes da Agenda</h2>
        <div className="sf-fields">
          {fields.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </div>
      </div>
      <div className="sf-card" style={{ marginTop: 16, padding: 18 }}>
        <h2>Hierarquia</h2>
        <p>
          <Link to="/quotes/$id" params={{ id: data.quote_id }} style={{ color: "#0176d3" }}>
            Cotação {data.quote_number}
          </Link>{" "}
          ›{" "}
          <Link
            to="/quote-line-items/$id"
            params={{ id: data.item_id }}
            style={{ color: "#0176d3" }}
          >
            Item {data.flow_code} · {data.item_service}
          </Link>{" "}
          › Esta Agenda
        </p>
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

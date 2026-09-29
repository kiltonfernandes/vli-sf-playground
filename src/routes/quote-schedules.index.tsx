import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listQuoteSchedules } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
import { fmtMoney } from "@/lib/format";
export const Route = createFileRoute("/quote-schedules/")({
  head: () => ({ meta: [{ title: "Agendas | CRM" }] }),
  component: Page,
});
function Page() {
  const { data = [] } = useQuery({
    queryKey: ["quote-schedules"],
    queryFn: async () => (await listQuoteSchedules()) as any[],
  });
  const columns: Column<any>[] = [
    {
      key: "key",
      label: "Chave da agenda",
      render: (r) => (
        <Link
          to="/quote-schedules/$id"
          params={{ id: r.id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {r.schedule_key}
        </Link>
      ),
      sortValue: (r) => r.schedule_key,
    },
    {
      key: "quote",
      label: "Cotação",
      render: (r) => (
        <Link to="/quotes/$id" params={{ id: r.quote_id }} style={{ color: "#0176d3" }}>
          {r.quote_number}
        </Link>
      ),
      sortValue: (r) => r.quote_number,
    },
    {
      key: "route",
      label: "Fluxo / rota",
      render: (r) => `${r.flow_code} · ${r.route}`,
      sortValue: (r) => r.flow_code,
    },
    {
      key: "period",
      label: "Período",
      render: (r) => `${String(r.month).padStart(2, "0")}/${r.year} · ${r.period_window}`,
      sortValue: (r) => r.year * 100 + r.month,
    },
    {
      key: "volume",
      label: "Volume",
      render: (r) => Number(r.volume).toLocaleString("pt-BR"),
      sortValue: (r) => Number(r.volume),
    },
    {
      key: "tariff",
      label: "Tarifa líquida",
      render: (r) => fmtMoney(Number(r.tariff_net)),
      sortValue: (r) => Number(r.tariff_net),
    },
    { key: "service", label: "Serviço", render: (r) => r.service, sortValue: (r) => r.service },
  ];
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Vendas · Cotações</div>
          <h1 className="sf-ph-title">Agendas</h1>
          <div className="sf-ph-sub">
            Cada registro representa um serviço em uma combinação de fluxo e período.
          </div>
        </div>
        <Link className="sf-btn" to="/quotes">
          Cotações
        </Link>
      </div>
      <SfListView
        rows={data}
        columns={columns}
        rowKey={(r) => r.id}
        itemLabel="agendas"
        objectKey="quote_schedules"
      />
    </SfShell>
  );
}

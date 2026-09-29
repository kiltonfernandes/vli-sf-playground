import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listQuoteItems } from "@/lib/crud";
import { SfShell } from "@/components/SfShell";
import { SfListView, type Column } from "@/components/SfListView";
export const Route = createFileRoute("/quote-line-items/")({
  head: () => ({ meta: [{ title: "Itens da Cotação | CRM" }] }),
  component: Page,
});
function Page() {
  const { data = [] } = useQuery({
    queryKey: ["quote-items"],
    queryFn: async () => (await listQuoteItems()) as any[],
  });
  const columns: Column<any>[] = [
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
      key: "flow",
      label: "Fluxo",
      render: (r) => (
        <Link
          to="/quote-line-items/$id"
          params={{ id: r.id }}
          style={{ color: "#0176d3", fontWeight: 600 }}
        >
          {r.flow_code} · {r.route}
        </Link>
      ),
      sortValue: (r) => r.flow_code,
    },
    {
      key: "commodity",
      label: "Mercadoria",
      render: (r) => r.merchandise_name,
      sortValue: (r) => r.merchandise_name,
    },
    { key: "service", label: "Serviço", render: (r) => r.service, sortValue: (r) => r.service },
    {
      key: "schedules",
      label: "Agendas",
      render: (r) => String(r.schedule_count ?? 0),
      sortValue: (r) => Number(r.schedule_count ?? 0),
    },
  ];
  return (
    <SfShell>
      <div className="sf-page-header">
        <div>
          <div className="sf-ph-eyebrow">Vendas · Cotações</div>
          <h1 className="sf-ph-title">Itens da Cotação</h1>
          <div className="sf-ph-sub">Um totalizador por fluxo e serviço.</div>
        </div>
        <Link className="sf-btn" to="/quotes">
          Cotações
        </Link>
      </div>
      <SfListView
        rows={data}
        columns={columns}
        rowKey={(r) => r.id}
        itemLabel="itens"
        objectKey="quote_line_items"
      />
    </SfShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/planned-flows/$id")({
  head: () => ({ meta: [{ title: "Fluxo Planejado | CRM" }] }),
  component: function Page() {
    const { id } = Route.useParams();
    return <SfReferenceObjectPage object="planned_flows" id={id} />;
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/planned-flows/")({
  head: () => ({ meta: [{ title: "Fluxos Planejados | CRM" }] }),
  component: () => <SfReferenceObjectPage object="planned_flows" />,
});

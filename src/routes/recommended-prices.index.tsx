import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/recommended-prices/")({
  head: () => ({ meta: [{ title: "Preços Recomendados | CRM" }] }),
  component: () => <SfReferenceObjectPage object="recommended_prices" />,
});

import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/recommended-prices/$id")({
  head: () => ({ meta: [{ title: "Preço Recomendado | CRM" }] }),
  component: function Page() {
    const { id } = Route.useParams();
    return <SfReferenceObjectPage object="recommended_prices" id={id} />;
  },
});

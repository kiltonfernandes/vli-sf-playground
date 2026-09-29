import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/merchandise/$id")({
  head: () => ({ meta: [{ title: "Mercadoria | CRM" }] }),
  component: function Page() {
    const { id } = Route.useParams();
    return <SfReferenceObjectPage object="merchandise" id={id} />;
  },
});

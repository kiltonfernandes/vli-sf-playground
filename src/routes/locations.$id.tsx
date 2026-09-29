import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/locations/$id")({
  head: () => ({ meta: [{ title: "Location | CRM" }] }),
  component: function Page() {
    const { id } = Route.useParams();
    return <SfReferenceObjectPage object="locations" id={id} />;
  },
});

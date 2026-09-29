import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/approvers/$id")({
  head: () => ({ meta: [{ title: "Aprovador | CRM" }] }),
  component: function Page() {
    const { id } = Route.useParams();
    return <SfReferenceObjectPage object="approvers" id={id} />;
  },
});

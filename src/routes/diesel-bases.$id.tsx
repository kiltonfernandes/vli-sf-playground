import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/diesel-bases/$id")({
  head: () => ({ meta: [{ title: "Base Diesel | CRM" }] }),
  component: function Page() {
    const { id } = Route.useParams();
    return <SfReferenceObjectPage object="diesel_bases" id={id} />;
  },
});

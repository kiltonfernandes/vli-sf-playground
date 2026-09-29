import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/locations/")({
  head: () => ({ meta: [{ title: "Locations | CRM" }] }),
  component: () => <SfReferenceObjectPage object="locations" />,
});

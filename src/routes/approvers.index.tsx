import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/approvers/")({
  head: () => ({ meta: [{ title: "Aprovadores | CRM" }] }),
  component: () => <SfReferenceObjectPage object="approvers" />,
});

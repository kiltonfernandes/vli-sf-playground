import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/merchandise/")({
  head: () => ({ meta: [{ title: "Mercadorias | CRM" }] }),
  component: () => <SfReferenceObjectPage object="merchandise" />,
});

import { createFileRoute } from "@tanstack/react-router";
import { SfReferenceObjectPage } from "@/components/SfReferenceObjectPage";
export const Route = createFileRoute("/diesel-bases/")({
  head: () => ({ meta: [{ title: "Bases Diesel | CRM" }] }),
  component: () => <SfReferenceObjectPage object="diesel_bases" />,
});

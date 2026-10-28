import { EmptyState } from "@/components/empty-state";

export default function PortalNotFound() {
  return <EmptyState icon="alert" title="That page does not exist" link={{ href: "/", label: "Back to Overview" }} />;
}

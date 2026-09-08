import { IncidentScreen } from "../../ui/screens";

export default async function Page({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  return <IncidentScreen id={incidentId} />;
}

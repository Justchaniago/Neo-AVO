import { ProjectScreen } from "../../ui/screens";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectScreen id={projectId} />;
}

import { TicketWorkspace } from "@/components/workspace/TicketWorkspace";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketWorkspace id={decodeURIComponent(id)} />;
}

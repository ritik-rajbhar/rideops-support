import { Suspense } from "react";
import { LoadingRows } from "@/components/QueryStates";
import { QueueView } from "@/components/queue/QueueView";

export default function QueuePage() {
  return (
    <Suspense fallback={<LoadingRows />}>
      <QueueView />
    </Suspense>
  );
}

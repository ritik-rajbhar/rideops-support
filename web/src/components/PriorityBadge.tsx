export function PriorityBadge({ priority }: { priority: string }) {
  const style =
    priority === "P1"
      ? "border-critical bg-critical text-white"
      : priority === "P2"
        ? "border-ink-2 text-ink"
        : "border-line text-ink-2";
  return (
    <span className={`inline-block w-8 rounded-sm border text-center text-xs font-semibold tabular-nums ${style}`}>
      {priority}
    </span>
  );
}

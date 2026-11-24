const PATHS = {
  check: "M3 8.5 6.5 12 13 4.5",
  alert: "M8 2.5 14.5 13.5h-13L8 2.5ZM8 6.5v3.5M8 12v.01",
  info: "M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.5V11M8 5v.01",
  bolt: "M9 1.5 3 9h4l-1 5.5L13 7H8.5L9 1.5Z",
  wrench: "M10.5 2a3.5 3.5 0 0 0-3.3 4.6L2 11.8 4.2 14l5.2-5.2A3.5 3.5 0 0 0 14 5.5l-2.2 2.2-2-.5-.5-2L11.5 3a3.5 3.5 0 0 0-1-.1Z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-4 w-4 shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

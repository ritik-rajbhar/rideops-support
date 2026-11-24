import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="mx-auto max-w-[1500px] px-4 py-3">{children}</main>
    </>
  );
}

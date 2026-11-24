"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

function readTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function ThemeSelect() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const change = (next: Theme) => {
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", next);
    } catch {
      // Theme simply will not persist when storage is unavailable.
    }
  };
  return (
    <label className="flex items-center gap-1 text-ink-2">
      <span className="sr-only">Theme</span>
      <select
        value={theme}
        suppressHydrationWarning
        onChange={(event) => change(event.target.value as Theme)}
        className="h-8 rounded border border-line bg-surface px-1 text-ink"
      >
        {THEMES.map((option) => (
          <option key={option} value={option}>
            {option[0]?.toUpperCase()}
            {option.slice(1)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const links = [
    { href: "/", label: "Queue", active: pathname === "/" || pathname.startsWith("/tickets") },
    { href: "/diagnosis", label: "Diagnosis", active: pathname.startsWith("/diagnosis") },
    { href: "/impact", label: "Impact", active: pathname.startsWith("/impact") },
  ];

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5">
        <Link href="/" className="font-semibold">
          RideOps <span className="font-normal text-ink-2">Pre-Escalation Check</span>
        </Link>
        <nav aria-label="Main" className="flex gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={link.active ? "page" : undefined}
              className={`rounded px-2 py-1 ${link.active ? "bg-raised font-medium text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSelect />
        </div>
      </div>
    </header>
  );
}

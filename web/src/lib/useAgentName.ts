"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "rideops_agent_name";
const listeners = new Set<() => void>();
let memoryValue = "";

function read() {
  try {
    return localStorage.getItem(KEY) ?? memoryValue;
  } catch {
    return memoryValue;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentName() {
  const name = useSyncExternalStore(subscribe, read, () => "");
  const setName = useCallback((next: string) => {
    memoryValue = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Falls back to the in-memory value for this tab.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [name, setName] as const;
}

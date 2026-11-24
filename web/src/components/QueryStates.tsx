"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ApiError, isWakingError } from "@/lib/api";
import { Icon } from "@/components/Icon";

const SLOW_AFTER_MS = 4_000;

export const buttonClass =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50";

function useSlowFlag(active: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);
  return active && slow;
}

export function WakingNotice({ onRetry, stopped = false }: { onRetry?: () => void; stopped?: boolean }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 border border-line bg-surface px-3 py-2.5">
      <Icon name="info" className="text-ink-2" />
      <p className="min-w-0 flex-1">
        {stopped
          ? "The server did not wake in time. It can take up to a minute, so try again."
          : "Waking the server, up to a minute. This page will load on its own."}
      </p>
      {onRetry ? (
        <button type="button" className={buttonClass} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "contract_mismatch") {
      return "The server sent a response this version cannot read.";
    }
    if (error.status === 404) return "Not found.";
    if (error.code === "network") return "Cannot reach the app. Check your connection.";
    if (error.code === "not_configured") return "The app is not configured: server settings are missing.";
  }
  return "Something went wrong loading this.";
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (isWakingError(error)) return <WakingNotice stopped onRetry={onRetry} />;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border border-line bg-surface px-3 py-2.5">
      <Icon name="alert" className="text-critical" />
      <p className="min-w-0 flex-1">{errorMessage(error)}</p>
      <button type="button" className={buttonClass} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <p className="border border-line bg-surface px-3 py-6 text-center text-ink-2">{children}</p>;
}

export function LoadingRows({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-px">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-10 animate-pulse bg-raised" />
      ))}
    </div>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  error: unknown;
  isPending: boolean;
  isError: boolean;
  failureReason: unknown;
  refetch: () => unknown;
}

/** Shared loading, cold-start and error handling for one query. */
export function QueryBoundary<T>({
  query,
  loading,
  children,
}: {
  query: QueryLike<T>;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const slow = useSlowFlag(query.isPending);
  if (query.isPending) {
    return (
      <div className="space-y-2">
        {slow || isWakingError(query.failureReason) ? (
          <WakingNotice onRetry={() => void query.refetch()} />
        ) : (
          <span className="sr-only" role="status">
            Loading
          </span>
        )}
        {loading ?? <LoadingRows />}
      </div>
    );
  }
  if (query.isError || query.data === undefined) {
    return <ErrorNotice error={query.error} onRetry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}

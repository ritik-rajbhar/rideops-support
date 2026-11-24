"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { fetchBacktest, fetchWeekly, isWakingError } from "@/lib/api";
import type { Backtest, BacktestRun, WeekMetrics } from "@/lib/contract";
import { formatRate, humanize, toPercentSeries } from "@/lib/domain";
import { Icon } from "@/components/Icon";
import { EmptyNotice, QueryBoundary } from "@/components/QueryStates";
import type { TrendPoint } from "@/components/impact/TrendChart";

const TrendChart = dynamic(() => import("@/components/impact/TrendChart"), {
  ssr: false,
  loading: () => <div className="h-[150px] animate-pulse bg-raised" />,
});

const percent = (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}%`;
const hours = (value: number) => `${value.toFixed(value >= 10 ? 0 : 1)}h`;
const count = (value: number) => value.toFixed(0);
const score = (value: number) => value.toFixed(2);
const axisPercent = (value: number) => `${Math.round(value)}%`;
const axisHours = (value: number) => `${Math.round(value)}h`;
const axisCount = (value: number) => String(Math.round(value));

interface Series {
  key: keyof WeekMetrics;
  title: string;
  hint: string;
  format: (value: number) => string;
  axisFormat: (value: number) => string;
  rate?: boolean;
  domain?: [number, number];
}

const OUTCOMES: Series[] = [
  { key: "avg_open_7d", title: "Open tickets", hint: "7-day average", format: count, axisFormat: axisCount },
  {
    key: "avoidable_escalation_share",
    title: "Avoidable escalation share",
    hint: "Of escalations to engineering",
    format: percent,
    axisFormat: axisPercent,
    rate: true,
  },
];

const GUARDRAILS: Series[] = [
  { key: "reopen_rate", title: "Reopen rate", hint: "Lower is better", format: percent, axisFormat: axisPercent, rate: true },
  { key: "p1p2_median_close_h", title: "P1/P2 median close", hint: "Hours, lower is better", format: hours, axisFormat: axisHours },
  { key: "csat_avg", title: "CSAT", hint: "Average, responders only", format: score, axisFormat: axisCount, domain: [1, 5] },
  {
    key: "csat_response_rate",
    title: "CSAT response rate",
    hint: "How far CSAT can be trusted",
    format: percent,
    axisFormat: axisPercent,
    rate: true,
  },
];

function seriesPoints(weeks: WeekMetrics[], series: Series): TrendPoint[] {
  const raw = weeks.map((week) => week[series.key] as number | null);
  const values = series.rate ? toPercentSeries(raw) : raw;
  return weeks.map((week, index) => ({
    week: week.week_start,
    partial: week.partial,
    value: values[index] ?? null,
  }));
}

function TrendPanel({ weeks, series, height }: { weeks: WeekMetrics[]; series: Series; height?: number }) {
  const points = seriesPoints(weeks, series);
  const latest = [...points].reverse().find((point) => !point.partial && point.value !== null);
  return (
    <figure className="min-w-0 border border-line bg-surface p-3">
      <figcaption className="mb-1 flex items-start justify-between gap-2">
        <span>
          <span className="block font-semibold">{series.title}</span>
          <span className="block text-xs text-ink-2">{series.hint}</span>
        </span>
        <span className="text-right">
          <span className="block text-lg leading-tight font-semibold tabular-nums">
            {latest?.value != null ? series.format(latest.value) : "n/a"}
          </span>
          <span className="block text-xs text-ink-2">last full week</span>
        </span>
      </figcaption>
      {points.some((point) => point.value !== null) ? (
        <TrendChart points={points} format={series.format} axisFormat={series.axisFormat} domain={series.domain} height={height} label={series.title} />
      ) : (
        <p className="py-8 text-center text-ink-2">No data reported.</p>
      )}
    </figure>
  );
}

function DataTable({ weeks }: { weeks: WeekMetrics[] }) {
  const all = [...OUTCOMES, ...GUARDRAILS];
  const columns = all.map((series) => seriesPoints(weeks, series));
  return (
    <details className="border border-line bg-surface">
      <summary className="cursor-pointer px-3 py-2 font-medium">Weekly data table</summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-right text-[13px] tabular-nums">
          <thead>
            <tr className="border-y border-line text-xs text-ink-2">
              <th scope="col" className="px-3 py-1 text-left font-medium">Week</th>
              <th scope="col" className="px-2 py-1 font-medium">Arrivals</th>
              <th scope="col" className="px-2 py-1 font-medium">Closures</th>
              <th scope="col" className="px-2 py-1 font-medium">Net</th>
              {all.map((series) => (
                <th key={series.key} scope="col" className="px-2 py-1 font-medium">{series.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, rowIndex) => (
              <tr key={week.week_start} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1 text-left font-normal whitespace-nowrap">
                  {week.week_start.slice(0, 10)}{week.partial ? " (partial)" : ""}
                </th>
                <td className="px-2 py-1">{week.arrivals ?? "n/a"}</td>
                <td className="px-2 py-1">{week.closures ?? "n/a"}</td>
                <td className="px-2 py-1">{week.net_flow ?? "n/a"}</td>
                {all.map((series, columnIndex) => {
                  const value = columns[columnIndex]?.[rowIndex]?.value ?? null;
                  return (
                    <td key={series.key} className="px-2 py-1">
                      {value === null ? "n/a" : series.format(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Stat({
  label,
  value,
  note,
  flagged = false,
}: {
  label: string;
  value: ReactNode;
  note: string;
  flagged?: boolean;
}) {
  return (
    <div className="border border-line bg-surface p-3">
      <p className="flex items-center gap-1 text-xs font-semibold text-ink-2">
        {flagged ? <Icon name="alert" className="text-critical" /> : null}
        {label}
        {flagged ? <span className="sr-only">(needs attention)</span> : null}
      </p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-ink-2">{note}</p>
    </div>
  );
}

const RESULT_LABELS: Record<string, string> = {
  revised_not_clean_holdout: "Revised policy: not a clean holdout",
  original_pre_change: "Original replay, before the revision",
};

const resultLabel = (label: string) => RESULT_LABELS[label] ?? humanize(label);
const KNOWN_ISSUE = "likely_known_issue";
const rate = (value: number | null | undefined) => formatRate(value ?? null);
const plain = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : String(value));
const ofTotal = (value: number | undefined, total: number | null | undefined) =>
  value === undefined ? "n/a" : total === null || total === undefined ? String(value) : `${value} of ${total}`;
const lift = (value: number | null | undefined) =>
  value === null || value === undefined ? "n/a" : `${value.toFixed(1)}x`;

const COMPARISON: { label: string; value: (run: BacktestRun) => string }[] = [
  { label: "Escalations replayed", value: (run) => plain(run.escalations) },
  {
    label: "Fixed bugs delayed",
    value: (run) => ofTotal(run.fixed_bugs_delayed?.count, run.fixed_bugs_delayed?.fixed_total),
  },
  { label: "Fixed bugs delayed, rate", value: (run) => rate(run.fixed_bugs_delayed?.rate) },
  { label: "P1 misses", value: (run) => ofTotal(run.p1?.misses, run.p1?.total) },
  { label: "Known-issue precision", value: (run) => rate(run.precision_by_verdict[KNOWN_ISSUE]?.precision) },
  { label: "Known-issue base rate", value: (run) => rate(run.precision_by_verdict[KNOWN_ISSUE]?.base_rate) },
  { label: "Known-issue lift", value: (run) => lift(run.precision_by_verdict[KNOWN_ISSUE]?.lift) },
  { label: "Held for review", value: (run) => plain(run.held_for_review?.count) },
  { label: "Avoidable caught", value: (run) => plain(run.held_for_review?.avoidable) },
  { label: "Share of avoidable caught", value: (run) => rate(run.held_for_review?.recall_avoidable) },
  { label: "Precision of holds (avoidable)", value: (run) => rate(run.held_for_review?.precision_avoidable) },
];

const windowText = (run: BacktestRun) =>
  run.window ? `${run.window.start.slice(0, 10)} to ${run.window.end.slice(0, 10)}` : "n/a";

export function BacktestResults({ data }: { data: Backtest }) {
  const original = data.original_pre_change ?? null;
  const knownIssue = data.precision_by_verdict[KNOWN_ISSUE];
  const delayed = data.fixed_bugs_delayed;
  const runs: { heading: string; run: BacktestRun }[] = [
    { heading: resultLabel(data.result_label), run: data },
    ...(original ? [{ heading: resultLabel(original.result_label), run: original }] : []),
  ];
  const verdictKeys = [...new Set(runs.flatMap(({ run }) => Object.keys(run.flagged_by_verdict)))];
  return (
    <div className="space-y-2">
      <div role="note" className="border-l-2 border-warning bg-surface px-3 py-2">
        <p className="flex items-center gap-1.5 text-[15px] font-semibold">
          <Icon name="alert" className="text-warning" />
          {resultLabel(data.result_label)}
        </p>
        <p className="mt-0.5">{data.methodology_note}</p>
        <p className="mt-1 text-xs text-ink-2">
          Window {windowText(data)}. Policy {data.policy_version ?? "n/a"}.
          {data.clean_holdout ? "" : " Do not read this as a clean holdout."}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Fixed bugs delayed"
          value={ofTotal(delayed?.count, delayed?.fixed_total)}
          note={`Real bugs the check would have held (${rate(delayed?.rate)}). This is the cost of the tool.`}
          flagged={(delayed?.count ?? 0) > 0}
        />
        <Stat
          label="P1 misses"
          value={ofTotal(data.p1?.misses, data.p1?.total)}
          note="P1s given anything other than the fast path. The target is 0."
          flagged={(data.p1?.misses ?? 0) > 0}
        />
        <Stat
          label="Known-issue precision"
          value={rate(knownIssue?.precision)}
          note={`${lift(knownIssue?.lift)} lift over a ${rate(knownIssue?.base_rate)} base rate.`}
        />
        <Stat
          label="Avoidable caught"
          value={ofTotal(data.held_for_review?.avoidable, data.held_for_review?.count)}
          note={`Of tickets held. ${rate(data.held_for_review?.recall_avoidable)} of all avoidable escalations.`}
        />
      </div>

      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[520px] text-right text-[13px] tabular-nums">
          <caption className="px-3 pt-2 text-left text-xs font-semibold text-ink-2">Revised versus original</caption>
          <thead>
            <tr className="border-b border-line text-xs text-ink-2">
              <th scope="col" className="px-3 py-1 text-left font-medium">Measure</th>
              {runs.map(({ heading }) => (
                <th key={heading} scope="col" className="px-3 py-1 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.label} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1 text-left font-normal">{row.label}</th>
                {runs.map(({ heading, run }) => (
                  <td key={heading} className="px-3 py-1">{row.value(run)}</td>
                ))}
              </tr>
            ))}
            {verdictKeys.map((key) => (
              <tr key={key} className="border-b border-line last:border-b-0">
                <th scope="row" className="px-3 py-1 text-left font-normal">Flagged: {humanize(key)}</th>
                {runs.map(({ heading, run }) => (
                  <td key={heading} className="px-3 py-1">{plain(run.flagged_by_verdict[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.assumptions.length > 0 ? (
        <div className="border border-line bg-surface px-3 py-2">
          <h3 className="mb-1 text-xs font-semibold text-ink-2">Assumptions</h3>
          <ul className="list-disc space-y-0.5 pl-4">
            {data.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// The replay can take over a minute on a cold, low-CPU host.
const BACKTEST_MAX_RETRIES = 40;
const BACKTEST_RETRY_DELAY_MS = 3_000;

export function ImpactView() {
  const weekly = useQuery({ queryKey: ["metrics", "weekly"], queryFn: ({ signal }) => fetchWeekly(signal) });
  const backtest = useQuery({
    queryKey: ["metrics", "backtest"],
    queryFn: ({ signal }) => fetchBacktest(signal),
    retry: (failures, error) => isWakingError(error) && failures < BACKTEST_MAX_RETRIES,
    retryDelay: BACKTEST_RETRY_DELAY_MS,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold">Impact</h1>
        <p className="text-ink-2">Dashed segments are partial weeks and are left out of “last full week”.</p>
      </div>
      <QueryBoundary query={weekly}>
        {({ weeks }) =>
          weeks.length === 0 ? (
            <EmptyNotice>No weekly metrics yet.</EmptyNotice>
          ) : (
            <div className="space-y-4">
              <section aria-labelledby="outcomes" className="space-y-2">
                <h2 id="outcomes" className="text-sm font-semibold">Outcomes</h2>
                <div className="grid gap-2 lg:grid-cols-2">
                  {OUTCOMES.map((series) => (
                    <TrendPanel key={series.key} weeks={weeks} series={series} height={190} />
                  ))}
                </div>
              </section>
              <section aria-labelledby="guardrails" className="space-y-2">
                <h2 id="guardrails" className="text-sm font-semibold">Guardrails</h2>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {GUARDRAILS.map((series) => (
                    <TrendPanel key={series.key} weeks={weeks} series={series} />
                  ))}
                </div>
              </section>
              <DataTable weeks={weeks} />
            </div>
          )
        }
      </QueryBoundary>
      <section aria-labelledby="backtest" className="space-y-2">
        <div>
          <h2 id="backtest" className="text-sm font-semibold">Backtest</h2>
          <p className="text-ink-2">The check replayed on past tickets. It estimates what would have happened and is not a live result.</p>
        </div>
        <QueryBoundary query={backtest}>{(data) => <BacktestResults data={data} />}</QueryBoundary>
      </section>
    </div>
  );
}

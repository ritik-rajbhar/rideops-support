"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fetchDiagnosis } from "@/lib/api";
import type { Diagnosis } from "@/lib/contract";
import { formatRate } from "@/lib/domain";
import { Icon } from "@/components/Icon";
import { QueryBoundary } from "@/components/QueryStates";

type Agent = Diagnosis["agents"][number];

const rate = (value: number | null | undefined) => formatRate(value ?? null, 0);
const hours = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : `${Math.round(value)}h`);
const score = (value: number | null | undefined) => (value === null || value === undefined ? "n/a" : value.toFixed(2));
const monthName = (value: string) =>
  new Date(`${value}-01T00:00:00`).toLocaleString("en-GB", { month: "short", year: "numeric" });

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return null;
  return sorted.length % 2 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

function Tile({ label, value, note }: { label: string; value: ReactNode; note: ReactNode }) {
  return (
    <div className="border border-line bg-surface p-3">
      <p className="text-xs font-semibold text-ink-2">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-ink-2">{note}</p>
    </div>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div>
        <h2 id={id} className="text-sm font-semibold">{title}</h2>
        <p className="text-ink-2">{hint}</p>
      </div>
      {children}
    </section>
  );
}

const th = "px-3 py-1 font-medium";
const td = "px-3 py-1";

function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="ml-1.5 inline-block rounded-sm border border-critical px-1 text-[11px] font-semibold text-critical-text">
      {children}
    </span>
  );
}

interface Outliers {
  fastest: Agent | null;
  mostAvoidable: Agent | null;
  teamReopen: number | null;
}

function findOutliers(agents: Agent[]): Outliers {
  const withClose = agents.filter((agent) => agent.median_first_close_h !== null);
  const fastest = withClose.reduce<Agent | null>(
    (best, agent) => (best === null || (agent.median_first_close_h ?? 0) < (best.median_first_close_h ?? 0) ? agent : best),
    null,
  );
  const mostAvoidable = agents.reduce<Agent | null>(
    (best, agent) => (best === null || agent.avoidable > best.avoidable ? agent : best),
    null,
  );
  const teamReopen = median(agents.flatMap((agent) => (agent.reopen_rate === null ? [] : [agent.reopen_rate])));
  return { fastest, mostAvoidable, teamReopen };
}

function Claims({ data, outliers }: { data: Diagnosis; outliers: Outliers }) {
  const h = data.headline;
  const { fastest, mostAvoidable, teamReopen } = outliers;
  const claims: { who: string; claim: string; finding: ReactNode }[] = [
    {
      who: "Support Lead",
      claim: "Engineering is the bottleneck; escalations disappear for days.",
      finding: (
        <>
          Partly true. Real bugs close in a median {hours(h.median_close_h_fixed)}, but escalations sent back for
          missing information or configuration take {hours(h.median_close_h_bounced)}: the extra time is round trips,
          not slow fixing.
        </>
      ),
    },
    {
      who: "Support Lead",
      claim: "Some agents close tickets in a few hours, so it can be done fast.",
      finding: fastest ? (
        <>
          The fastest closer, {fastest.agent}, closes L1 tickets in a median {hours(fastest.median_first_close_h)}, but{" "}
          {rate(fastest.reopen_rate)} of them are reopened against a team median of {rate(teamReopen)}, and CSAT is{" "}
          {score(fastest.csat_avg)}. Speed without the checks moves work, it does not remove it.
        </>
      ) : (
        "Not enough data."
      ),
    },
    {
      who: "Engineering Manager",
      claim: "Much of what support escalates should not reach engineering.",
      finding: (
        <>
          True. {rate(h.avoidable_share)} of escalations ({h.avoidable} of {h.escalated}) came back without an engineering
          fix, and {rate(h.bounced_share)} were returned for missing information or configuration.
          {mostAvoidable ? (
            <>
              {" "}
              One agent, {mostAvoidable.agent}, accounts for {mostAvoidable.avoidable} of them.
            </>
          ) : null}
        </>
      ),
    },
    {
      who: "Head of Operations",
      claim: "Open tickets keep rising and there is no budget to hire.",
      finding: (
        <>
          Intake rose from {h.intake_first_month ?? "n/a"} to {h.intake_last_month ?? "n/a"} tickets a month. Hiring is not
          the only lever: avoidable escalations hold {rate(h.open_hours_share_avoidable)} of all open ticket-hours, so
          cutting them frees capacity without new people.
        </>
      ),
    },
  ];
  return (
    <ul className="grid gap-2 lg:grid-cols-2">
      {claims.map((item) => (
        <li key={item.claim} className="border border-line bg-surface p-3">
          <p className="text-xs font-semibold text-ink-2">{item.who} said</p>
          <p className="italic">“{item.claim}”</p>
          <p className="mt-1.5 flex gap-1.5">
            <Icon name="info" className="mt-0.5 text-accent" />
            <span>{item.finding}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export function DiagnosisResults({ data }: { data: Diagnosis }) {
  const h = data.headline;
  const outliers = findOutliers(data.agents);
  const growth =
    h.intake_first_month && h.intake_last_month ? (h.intake_last_month - h.intake_first_month) / h.intake_first_month : null;
  const reopenFlag = (agent: Agent) =>
    outliers.teamReopen !== null && agent.reopen_rate !== null && agent.reopen_rate >= 2 * outliers.teamReopen;
  const avoidableFlag = (agent: Agent) => agent === outliers.mostAvoidable;

  return (
    <div className="space-y-5">
      <div role="note" className="border-l-2 border-accent bg-surface px-3 py-2.5">
        <p className="text-[15px] font-semibold">
          The backlog grows because escalations that did not need engineering sit open the longest.
        </p>
        <p className="mt-0.5 text-ink-2">
          Escalated tickets are {rate(h.escalation_rate)} of all tickets but hold {rate(h.open_hours_share_escalated)} of
          open ticket-hours. Avoidable escalations alone hold {rate(h.open_hours_share_avoidable)}.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Monthly intake"
          value={growth === null ? "n/a" : `+${rate(growth)}`}
          note={`${h.intake_first_month ?? "n/a"} in July to ${h.intake_last_month ?? "n/a"} in September`}
        />
        <Tile
          label="Escalations not fixed by engineering"
          value={rate(h.avoidable_share)}
          note={`${h.avoidable} of ${h.escalated}: missing info, config, how-to or duplicate`}
        />
        <Tile
          label="Time to close a bounced escalation"
          value={hours(h.median_close_h_bounced)}
          note={`Median, against ${hours(h.median_close_h_fixed)} for a real bug and ${hours(h.median_close_h_not_escalated)} kept at L1`}
        />
        <Tile
          label="CSAT on bounced escalations"
          value={score(h.csat_bounced)}
          note={`Against ${score(h.csat_not_escalated)} for tickets kept at L1`}
        />
      </div>

      <Section id="claims" title="What the data says about each view" hint="The three interviews, checked against the ticket file.">
        <Claims data={data} outliers={outliers} />
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section id="outcomes" title="Where escalations end up" hint="Engineering outcome of every escalated ticket. Flagged rows did not need an engineering fix.">
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[520px] text-right text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line text-xs text-ink-2">
                  <th scope="col" className={`${th} text-left`}>Outcome</th>
                  <th scope="col" className={th}>Tickets</th>
                  <th scope="col" className={th}>Median close</th>
                  <th scope="col" className={th}>Handoffs</th>
                  <th scope="col" className={th}>CSAT</th>
                </tr>
              </thead>
              <tbody>
                {data.outcomes.map((row) => (
                  <tr key={row.outcome} className="border-b border-line last:border-b-0">
                    <th scope="row" className={`${td} text-left font-normal`}>
                      {row.outcome}
                      {row.avoidable ? <Flag>avoidable</Flag> : null}
                    </th>
                    <td className={td}>{row.tickets}</td>
                    <td className={td}>{hours(row.median_close_h)}</td>
                    <td className={td}>{row.avg_handoffs?.toFixed(1) ?? "n/a"}</td>
                    <td className={td}>{score(row.csat_avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="months" title="Month by month" hint="Volume is the main driver of growth; the escalation mix stays bad.">
          <div className="overflow-x-auto border border-line bg-surface">
            <table className="w-full min-w-[460px] text-right text-[13px] tabular-nums">
              <thead>
                <tr className="border-b border-line text-xs text-ink-2">
                  <th scope="col" className={`${th} text-left`}>Month</th>
                  <th scope="col" className={th}>Tickets</th>
                  <th scope="col" className={th}>Escalated</th>
                  <th scope="col" className={th}>Avoidable of escalated</th>
                  <th scope="col" className={th}>Median close</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => (
                  <tr key={row.month} className="border-b border-line last:border-b-0">
                    <th scope="row" className={`${td} text-left font-normal`}>{monthName(row.month)}</th>
                    <td className={td}>{row.tickets}</td>
                    <td className={td}>{rate(row.escalation_rate)}</td>
                    <td className={td}>{rate(row.avoidable_share)}</td>
                    <td className={td}>{hours(row.median_close_h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <Section id="categories" title="Categories" hint="Sorted by avoidable escalations. The top three are where a pre-escalation check pays off first.">
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[620px] text-right text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line text-xs text-ink-2">
                <th scope="col" className={`${th} text-left`}>Category</th>
                <th scope="col" className={th}>Tickets</th>
                <th scope="col" className={th}>Escalated</th>
                <th scope="col" className={th}>Escalation rate</th>
                <th scope="col" className={th}>Avoidable</th>
                <th scope="col" className={th}>Avoidable of escalated</th>
              </tr>
            </thead>
            <tbody>
              {data.categories.map((row) => (
                <tr key={row.category} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-left font-normal`}>{row.category}</th>
                  <td className={td}>{row.tickets}</td>
                  <td className={td}>{row.escalated}</td>
                  <td className={td}>{rate(row.escalation_rate)}</td>
                  <td className={`${td} font-semibold`}>{row.avoidable}</td>
                  <td className={td}>{rate(row.avoidable_share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="agents"
        title="Agents"
        hint="For coaching, not blame. First close and reopen rate are for tickets kept at L1."
      >
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full min-w-[720px] text-right text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-line text-xs text-ink-2">
                <th scope="col" className={`${th} text-left`}>Agent</th>
                <th scope="col" className={th}>Tickets</th>
                <th scope="col" className={th}>Escalation rate</th>
                <th scope="col" className={th}>Avoidable escalations</th>
                <th scope="col" className={th}>Median first close</th>
                <th scope="col" className={th}>Reopen rate</th>
                <th scope="col" className={th}>CSAT</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((agent) => (
                <tr key={agent.agent} className="border-b border-line last:border-b-0">
                  <th scope="row" className={`${td} text-left font-normal`}>{agent.agent}</th>
                  <td className={td}>{agent.tickets}</td>
                  <td className={td}>{rate(agent.escalation_rate)}</td>
                  <td className={td}>
                    {avoidableFlag(agent) ? <Flag>highest</Flag> : null} {agent.avoidable}
                  </td>
                  <td className={td}>{hours(agent.median_first_close_h)}</td>
                  <td className={td}>
                    {reopenFlag(agent) ? <Flag>2x team</Flag> : null} {rate(agent.reopen_rate)}
                  </td>
                  <td className={td}>{score(agent.csat_avg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

export function DiagnosisView() {
  const query = useQuery({ queryKey: ["metrics", "diagnosis"], queryFn: ({ signal }) => fetchDiagnosis(signal) });
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold">Diagnosis</h1>
        <p className="text-ink-2">
          Why open tickets keep rising. Every number is computed from the ticket file, 2 Jul to 30 Sep 2026.
        </p>
      </div>
      <QueryBoundary query={query}>{(data) => <DiagnosisResults data={data} />}</QueryBoundary>
    </div>
  );
}

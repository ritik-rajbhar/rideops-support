const TICKET_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TICKET_QUERY_PARAMS = ["status", "agent", "category", "priority", "q", "limit", "offset"];
const MAX_PARAM_LENGTH = 200;

export interface ProxyTarget {
  path: string;
  query: string;
}

function allowedQuery(search: URLSearchParams, allowed: readonly string[]) {
  const query = new URLSearchParams();
  for (const name of allowed) {
    const value = search.get(name);
    if (value !== null && value.length <= MAX_PARAM_LENGTH) query.set(name, value);
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Returns the upstream target, or null when the request is not allow-listed. */
export function resolveProxyTarget(
  method: string,
  segments: readonly string[],
  search: URLSearchParams,
): ProxyTarget | null {
  const [first, second, third, ...rest] = segments;
  if (rest.length > 0) return null;

  if (method === "GET") {
    if (first === "health" && segments.length === 1) return { path: "/health", query: "" };
    if (first === "metrics" && segments.length === 2 && (second === "weekly" || second === "backtest" || second === "diagnosis")) {
      return { path: `/metrics/${second}`, query: "" };
    }
    if (first === "tickets" && segments.length === 1) {
      return { path: "/tickets", query: allowedQuery(search, TICKET_QUERY_PARAMS) };
    }
    if (first === "tickets" && segments.length === 2 && second && TICKET_ID.test(second)) {
      return { path: `/tickets/${second}`, query: "" };
    }
    return null;
  }

  if (
    method === "POST" &&
    first === "tickets" &&
    segments.length === 3 &&
    second &&
    TICKET_ID.test(second) &&
    (third === "precheck" || third === "decisions")
  ) {
    return { path: `/tickets/${second}/${third}`, query: "" };
  }
  return null;
}

import type { AppLogsRequest } from "./app-logs-request";

/** The query string both endpoints read. The follow's contract carries no `to`. */
export function toLogQuery(request: AppLogsRequest): Record<string, string | number | undefined> {
  return {
    from: request.from,
    to: request.to,
    color: request.color,
    contains: request.contains,
    limit: request.limit
  };
}

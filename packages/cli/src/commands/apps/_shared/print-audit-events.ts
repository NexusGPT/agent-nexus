import { color, isJsonMode, printPaginationMeta, printTable } from "../../../output";
import { type ListAuditEventsResponse } from "../../../vibe-wire-types";
import { colorizeEventType } from "./colorize-event-type";
import { formatPayloadDetails } from "./format-payload-details";
import { formatTimestamp } from "./format-timestamp";
import { shortenId } from "./shorten-id";

export function printAuditEvents(data: ListAuditEventsResponse): void {
  if (isJsonMode()) {
    // Pass the wire envelope through unchanged so jq consumers see the
    // discriminated union as the backend emitted it.
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.events.length === 0) {
    console.log(color.dim("No audit events match this query."));
    return;
  }

  const rows = data.events.map((e) => ({
    // The event id is shortened: `apps audit` only lists, so no command
    // takes it. The APP id is not — it is the argument to `app get`,
    // `deployments list` and `deploy`, and this feed is often where a
    // reader first sees it.
    id: shortenId(e.id),
    createdAt: formatTimestamp(e.createdAt),
    eventType: colorizeEventType(e.payload.eventType),
    vibeAppId: e.vibeAppId === null ? color.dim("—") : e.vibeAppId,
    actor: e.actorUserId === null ? color.dim("system") : shortenId(e.actorUserId),
    details: formatPayloadDetails(e.payload)
  }));

  printTable(rows, [
    { key: "id", label: "Id", width: 10 },
    { key: "createdAt", label: "Created" },
    { key: "eventType", label: "Event" },
    { key: "vibeAppId", label: "App" },
    { key: "actor", label: "Actor", width: 10 },
    { key: "details", label: "Details" }
  ]);

  printPaginationMeta({ paging: data.nextCursor === null ? "exhausted" : "has-more" });
  if (data.nextCursor !== null) {
    console.log(color.dim(`\nNext page:\n  nexus apps audit list --cursor "${data.nextCursor}"`));
  }
}

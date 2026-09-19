import { VIBE_AUDIT_EVENT_TYPES } from "../../../vibe-audit-event-types.generated";

/**
 * The event types, two per line, indented to sit under a help heading.
 *
 * Shared by `--help` and the `--type` refusal so the two cannot disagree
 * about what is accepted — the disagreement being the defect: `--help`
 * documented 6 values while the feed emitted types it did not list.
 */
export function formatEventTypeHelp(): string {
  const width = Math.max(...VIBE_AUDIT_EVENT_TYPES.map((t) => t.length));
  const lines: string[] = [];
  for (let i = 0; i < VIBE_AUDIT_EVENT_TYPES.length; i += 2) {
    const pair = VIBE_AUDIT_EVENT_TYPES.slice(i, i + 2);
    lines.push(`  ${pair.map((t) => t.padEnd(width)).join("  ")}`.trimEnd());
  }
  return lines.join("\n");
}

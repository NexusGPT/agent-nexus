/**
 * Narrow `--status` locally rather than forwarding it.
 *
 * Forwarded verbatim a typo 400s on a query parameter, which reads as a server
 * problem. The three values are also upper-case on the wire and nobody types
 * them that way, so the input is folded first.
 */
export function readAccessRequestStatus(
  raw: string | undefined
): "PENDING" | "APPROVED" | "REJECTED" | undefined {
  if (raw === undefined) return undefined;
  const upper = raw.toUpperCase();
  if (upper === "PENDING" || upper === "APPROVED" || upper === "REJECTED") return upper;
  throw new Error(`Invalid --status "${raw}". Expected PENDING, APPROVED or REJECTED.`);
}

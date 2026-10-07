/**
 * Narrow `--status` locally rather than forwarding it — `read-access-request-status.ts`
 * carries why. A deletion request has a fourth state an access request cannot:
 * `SUPERSEDED`, the Role deleted some other way while the request was open.
 */
export function readDeletionRequestStatus(
  raw: string | undefined
): "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED" | undefined {
  if (raw === undefined) return undefined;
  const upper = raw.toUpperCase();
  if (
    upper === "PENDING" ||
    upper === "APPROVED" ||
    upper === "REJECTED" ||
    upper === "SUPERSEDED"
  ) {
    return upper;
  }
  throw new Error(`Invalid --status "${raw}". Expected PENDING, APPROVED, REJECTED or SUPERSEDED.`);
}

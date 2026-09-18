/** APPROVED / REJECTED, case-folded. `PENDING` is a start state, never a verdict. */
export function readVerdict(raw: string): "APPROVED" | "REJECTED" {
  const upper = raw.toUpperCase();
  if (upper === "APPROVED" || upper === "REJECTED") return upper;
  throw new Error(`Invalid verdict "${raw}". Expected APPROVED or REJECTED.`);
}

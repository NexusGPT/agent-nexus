import { color } from "../../../output";

/** The status column, coloured — traces, generations and one trace read share it. */
export function formatStatus(v: unknown): string {
  const s = String(v);
  if (s === "COMPLETED") return color.green(s);
  if (s === "FAILED") return color.red(s);
  if (s === "IN_PROGRESS" || s === "RUNNING") return color.yellow(s);
  if (s === "PENDING") return color.dim(s);
  return s;
}

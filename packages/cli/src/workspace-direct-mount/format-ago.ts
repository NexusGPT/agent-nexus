import { coarseDuration } from "./coarse-duration";

/** "3m ago" — or "just now" inside the first second, and for a stamp in the future. */
export function formatAgo(at: string, now: Date): string {
  const ageMs = now.getTime() - new Date(at).getTime();
  if (ageMs < 1000) return "just now";
  return `${coarseDuration(ageMs)} ago`;
}

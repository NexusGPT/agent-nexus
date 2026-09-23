import { color } from "../../../output";
import type { VibeLogLineDto } from "../../../vibe-wire-types";

/** One human-readable line: instant, slot, message. */
export function formatLogLine(line: VibeLogLineDto): string {
  const slot = line.color === null ? "" : ` ${color.dim(`[${line.color}]`)}`;
  return `${color.dim(line.timestamp)}${slot} ${line.message}`;
}

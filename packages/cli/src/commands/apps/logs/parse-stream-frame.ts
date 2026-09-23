import type { VibeLogLineDto } from "../../../vibe-wire-types";
import type { StreamFrameParse } from "./stream-frame-parse";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLogLine(value: unknown): value is VibeLogLineDto {
  if (!isRecord(value)) return false;
  return (
    typeof value.timestampNs === "string" &&
    typeof value.timestamp === "string" &&
    typeof value.message === "string" &&
    (value.color === null || typeof value.color === "string")
  );
}

/**
 * One `data:` payload → a frame.
 *
 * Narrowed by inspection rather than declared by a cast: this is a trust
 * boundary, the bytes come off a socket, and a type assertion here would be a
 * claim about data nobody has looked at. The reward is that every downstream
 * consumer of a `lines` frame gets a real `VibeLogLineDto[]`.
 */
export function parseStreamFrame(payload: string): StreamFrameParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    return { status: "malformed", reason: "the log stream sent a frame that is not JSON" };
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return { status: "malformed", reason: "the log stream sent a frame with no type" };
  }

  if (parsed.type === "lines") {
    if (!Array.isArray(parsed.lines) || !parsed.lines.every(isLogLine)) {
      return {
        status: "malformed",
        reason: "the log stream sent a lines frame with unreadable lines"
      };
    }
    return { status: "frame", frame: { type: "lines", lines: parsed.lines } };
  }

  if (parsed.type === "end") {
    if (parsed.reason !== "upstream-closed") return { status: "ignored" };
    return { status: "frame", frame: { type: "end", reason: "upstream-closed" } };
  }

  if (parsed.type === "error") {
    if (typeof parsed.message !== "string") {
      return { status: "malformed", reason: "the log stream sent an error frame with no message" };
    }
    return { status: "frame", frame: { type: "error", message: parsed.message } };
  }

  return { status: "ignored" };
}

import type { VibeAppLogStreamFrame } from "../../../vibe-wire-types";

/**
 * What one SSE payload turned out to be.
 *
 * Three outcomes rather than a nullable frame, because they call for three
 * different actions and collapsing any two of them loses information the caller
 * needs. `ignored` is a well-formed frame carrying a `type` this build does not
 * know — a newer server is allowed to add one, and a CLI that treated that as a
 * protocol break would refuse to follow logs after every backend deploy.
 * `malformed` is genuinely not the contract, and is terminal.
 */
export type StreamFrameParse =
  | { status: "frame"; frame: VibeAppLogStreamFrame }
  | { status: "ignored" }
  | { status: "malformed"; reason: string };

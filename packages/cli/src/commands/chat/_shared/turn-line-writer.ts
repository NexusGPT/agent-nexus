import type { ChatStreamChunk } from "@agent-nexus/sdk";

import { color } from "../../../output";

/** The two writers a live turn needs, sharing one piece of line state. */
export interface TurnLineWriter {
  closeLine: () => void;
  writeDelta: (kind: "reasoning" | "text", delta: string) => void;
}

/** Tracks which kind of delta the cursor is mid-line on, and writes accordingly. */
export function createTurnLineWriter(): TurnLineWriter {
  /**
   * Which kind of delta the cursor is currently mid-line on.
   *
   * Both reasoning and text arrive as fragments written WITHOUT a newline, which
   * makes them indistinguishable if they share a line — and a model that reasons
   * between tool calls interleaves them constantly. Tracking the RUN is what
   * lets a switch break the line and label the new one; a plain boolean could
   * only say "something was written".
   */
  let openLine: "reasoning" | "text" | null = null;

  const closeLine = () => {
    if (openLine !== null) process.stdout.write("\n");
    openLine = null;
  };

  const writeDelta = (kind: "reasoning" | "text", delta: string) => {
    if (openLine !== kind) {
      closeLine();
      if (kind === "reasoning") process.stdout.write(color.dim("thinking  "));
      openLine = kind;
    }
    process.stdout.write(kind === "reasoning" ? color.dim(delta) : delta);
  };

  return { closeLine, writeDelta };
}

/** What a chunk says about the turn's outcome, in the two forms it takes. */
export type TurnFailure = { message: string };

/**
 * The failure arms, shared by the `--json` collector and the live renderer so
 * the two cannot disagree about which frames end a turn badly.
 *
 * An `error` frame REPLACES whatever came before it; a finish carrying
 * `finishReason: "error"` only fills a failure nothing else has recorded.
 */
export function applyChunkFailure(
  current: TurnFailure | null,
  chunk: ChatStreamChunk
): TurnFailure | null {
  if (chunk.type === "error") return { message: chunk.errorText };
  if (chunk.type === "finish" && chunk.finishReason === "error") {
    return current ?? { message: "The agent turn ended in an error." };
  }
  return current;
}

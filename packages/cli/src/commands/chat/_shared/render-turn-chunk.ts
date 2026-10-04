import type { ChatStreamChunk } from "@agent-nexus/sdk";

import { color } from "../../../output";
import type { TurnLineWriter } from "./turn-line-writer";

/**
 * One frame, on the HUMAN channel. Text deltas go out as they arrive and
 * everything else is a labelled line around them; the failure arms are
 * `applyChunkFailure`'s, so this prints and decides nothing.
 */
export function renderTurnChunk(chunk: ChatStreamChunk, writer: TurnLineWriter): void {
  const { closeLine, writeDelta } = writer;
  switch (chunk.type) {
    case "text-delta":
      writeDelta("text", chunk.delta);
      break;
    case "reasoning-delta":
      writeDelta("reasoning", chunk.delta);
      break;
    case "tool-input-start":
      closeLine();
      console.log(color.dim(`  → ${chunk.toolName}`));
      break;
    case "tool-output-available":
      closeLine();
      console.log(color.dim(`  ✓ tool ${chunk.toolCallId}`));
      break;
    case "tool-output-error":
      closeLine();
      console.error(color.red(`  ✗ tool ${chunk.toolCallId}: ${chunk.errorText}`));
      break;
    case "error":
      // TERMINAL for the message: a conformant client stops reading after
      // this, so anything the server sends afterwards is not read. Recorded
      // rather than printed here, so the caller reports it through the error
      // funnel and a `--json` run still gets a document.
      closeLine();
      break;
    case "finish":
      closeLine();
      if (chunk.finishReason !== undefined) {
        console.log(color.dim(`[${chunk.finishReason}]`));
      }
      break;
    default:
      // Every other member of the union is either unproduced today or carries
      // nothing a terminal can usefully render. Silently ignored rather than
      // printed as noise — `--json` is where the whole frame set lives.
      break;
  }
}

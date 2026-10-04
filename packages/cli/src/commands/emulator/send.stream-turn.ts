import type { EmulatorStreamEvent } from "@agent-nexus/sdk";

import { color, emitDocument, isJsonMode } from "../../output";
import { nonBlankOr } from "../../util/present-text";

/**
 * Renders a live turn (NEX-2768).
 *
 * Two output modes, and the split is the root epilogue's promise rather than a
 * preference: `--json` must print ONE document on stdout, so the frames are
 * collected and emitted as `{ events }` when the turn ends. Without it the
 * point is to watch, so tokens go out as they arrive and everything else is a
 * labelled line around them.
 *
 * `process.stdout.write`, not `console.log`, for the deltas: a token is a
 * fragment of a sentence and a newline per fragment would print the answer one
 * word per line.
 */
export async function streamTurn(events: AsyncIterable<EmulatorStreamEvent>): Promise<void> {
  const collected: EmulatorStreamEvent[] = [];
  const json = isJsonMode();

  /**
   * Which kind of delta the cursor is currently mid-line on.
   *
   * Both `thinking` and `token` arrive as fragments and are written WITHOUT a
   * newline — one line break per fragment would print the answer a word at a
   * time. That makes the two indistinguishable if they ever share a line, and a
   * model that reasons between tool calls interleaves them constantly. Tracking
   * the run is what lets a switch break the line and label the new one; a plain
   * boolean could only say "something was written".
   */
  let openLine: "thinking" | "token" | null = null;

  /** Ends the current run, if any, so the next output starts on its own line. */
  const closeLine = () => {
    if (openLine !== null) process.stdout.write("\n");
    openLine = null;
  };

  /** Writes a delta, opening a labelled line when the run changes. */
  const writeDelta = (kind: "thinking" | "token", delta: string) => {
    if (openLine !== kind) {
      closeLine();
      if (kind === "thinking") process.stdout.write(color.dim("thinking  "));
      openLine = kind;
    }
    process.stdout.write(kind === "thinking" ? color.dim(delta) : delta);
  };

  for await (const event of events) {
    if (json) {
      collected.push(event);
      continue;
    }

    switch (event.type) {
      case "start":
        console.log(color.dim(`chat ${event.chatId} · message ${event.messageId}`));
        break;
      case "thinking":
        writeDelta("thinking", event.delta);
        break;
      case "token":
        writeDelta("token", event.delta);
        break;
      case "tool_call":
        closeLine();
        console.log(
          color.dim(`  ${event.status === "started" ? "→" : "✓"} ${nonBlankOr(event.name, "tool")}`)
        );
        break;
      case "message":
        // The final text has usually already been printed token by token. It is
        // reprinted only when it was not — a turn served from cache, or a
        // provider that does not stream, emits the whole answer as one frame.
        // `openLine === "thinking"` counts as NOT printed: reasoning is not the
        // answer.
        if (openLine !== "token" && event.content.text) {
          closeLine();
          console.log(event.content.text);
        }
        closeLine();
        break;
      case "error":
        closeLine();
        console.error(color.red(`${event.code}: ${event.message}`));
        break;
      case "done":
        closeLine();
        console.log(color.dim(`[${event.status}]`));
        break;
    }
  }

  if (json) emitDocument({ events: collected });
}

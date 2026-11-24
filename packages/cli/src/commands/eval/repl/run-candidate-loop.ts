import type { NexusClient } from "@agent-nexus/sdk";

import { color } from "../../../output";
import { promptLine } from "../../../util/confirm";
import { editInEditor } from "./edit-in-editor";

/** What the candidate loop decided, once it hands control back to the user loop. */
export interface CandidateOutcome {
  /** True when the operator finished the whole session, not just this turn. */
  stop: boolean;
  /** The turn index just accepted, or null when nothing was accepted. */
  acceptedIndex: number | null;
}

/**
 * Drive one agent candidate to a decision: accept, edit-and-accept, regenerate
 * or finish.
 *
 * `checkpointOn` is local to one candidate on purpose — the user loop resets it
 * after every generate, so it never carries across turns.
 */
export async function runCandidateLoop(
  client: NexusClient,
  conversationId: string,
  firstCandidate: { content: string; toolCalls: { name: string }[] },
  nextLine: (prompt: string) => Promise<string | null>
): Promise<CandidateOutcome> {
  let candidate = firstCandidate;
  let checkpointOn = true;

  for (;;) {
    // DIALOGUE, and the sharpest case in either file: the prompt below asks the
    // operator to [a]ccept THIS text. On stdout it goes to the log file while
    // the question reaches the terminal, so the decision cannot be made at all.
    promptLine(`agent › ${candidate.content}`);
    if (candidate.toolCalls.length > 0) {
      promptLine(color.dim(`tools: ${candidate.toolCalls.map((t) => t.name).join(", ")}`));
    }
    const action = await nextLine(
      `[a]ccept  [e]dit  [r]egenerate  [c]heckpoint ${checkpointOn ? "on" : "off"}  [d]one › `
    );
    if (action === null) return { stop: true, acceptedIndex: null };

    switch (action.trim()) {
      case "a": {
        const turn = await client.goldenConversations.accept(conversationId);
        if (!checkpointOn) {
          await client.goldenConversations.setCheckpoint(conversationId, turn.index, {
            isCheckpoint: false
          });
        }
        return { stop: false, acceptedIndex: turn.index };
      }
      case "e": {
        const edited = await editInEditor(candidate.content);
        if (edited === null) {
          // DIALOGUE: it acknowledges the `e` just typed and names the keys to
          // answer with instead, so it belongs beside the prompt it re-asks.
          promptLine(
            color.dim("editor unavailable — accept, regenerate, or edit later with set-golden")
          );
          continue;
        }
        const turn = await client.goldenConversations.accept(conversationId, { content: edited });
        if (!checkpointOn) {
          await client.goldenConversations.setCheckpoint(conversationId, turn.index, {
            isCheckpoint: false
          });
        }
        return { stop: false, acceptedIndex: turn.index };
      }
      case "r": {
        // CONVERSATION, not a result: it tells the operator to wait, between a
        // prompt and its answer. `run-authoring-repl.ts`'s header owns the
        // reasoning; this is the identical write and moves with it.
        promptLine(color.dim("agent … regenerating"));
        candidate = (await client.goldenConversations.generate(conversationId)).candidate;
        continue;
      }
      case "c": {
        checkpointOn = !checkpointOn;
        continue;
      }
      case "d":
      case "done":
        return { stop: true, acceptedIndex: null };
      default:
        // DIALOGUE: the only reply to an unrecognised keystroke. On stdout the
        // operator retypes into a silent prompt with no idea what is valid.
        promptLine(
          color.dim("a = accept, e = edit, r = regenerate, c = checkpoint toggle, d = done")
        );
        continue;
    }
  }
}

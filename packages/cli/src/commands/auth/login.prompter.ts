import { stdin } from "node:process";
import readline from "node:readline/promises";

import { askWouldHang, promptStream } from "../../util/confirm";
import { unseeableQuestionRefusal } from "./login.unseeable-question";

/**
 * One prompt queue for a whole login run.
 *
 * `ask` and `close` share a single readline interface, so they must be taken
 * together from one `createPrompter()` call and closed by the same `finally`
 * that owns them. Splitting them apart re-creates NEX-1879 defect 3, described
 * inside the factory.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 EVERY `auth login` PROMPT NAMED `stdout` TWICE, SO ONE REDIRECT WAS ENOUGH
 *    TO HANG IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus auth login > out.log`, typed at a real keyboard: stdin is a terminal,
 * so nothing doubted there was an operator. Both the interface's `output` and
 * the hand-written question named `stdout` directly, so the question went into
 * out.log, the terminal stayed blank, and the process blocked on a keystroke for
 * a question nobody had been shown. All five prompts funnel through the one
 * `ask` below. A WIDER class than `canAsk()` closed: those sites already chose
 * through `promptStream()` and needed BOTH outputs redirected to go invisible.
 *
 * ── ROUTE FIRST, THEN GATE. THE ORDER IS THE DESIGN ─────────────────────────
 *
 * Routing both through `promptStream()` means that with stdout alone redirected
 * the question lands on the terminal and the ask SUCCEEDS — the right outcome,
 * since the operator is right there. The gate then bites only where NO stream
 * can carry a question at all.
 *
 * 🔴 A GATE WITHOUT THE ROUTING TURNS A WORKING SINGLE-REDIRECT ASK INTO A
 * REFUSAL, and it looks like a fix in any test that only asks "does it refuse".
 *
 * ── THE GATE IS NOT `canAsk()` ALONE, AND THIS IS NOT ITS ONLY SITE ─────────
 *
 * {@link askWouldHang} is the condition and `util/confirm.stream.ts` carries why
 * it is not `!canAsk()`: a pipe on stdin is a SHIPPED mode here (NEX-1879 defect
 * 3) and hangs on nothing.
 *
 * 🔴 THE GATE BELOW IS THE SECOND ONE, NOT THE FIRST. `resolveApiKey` asks the
 * same question before it prints a preamble and opens a browser window, because
 * a refusal that arrives after `openUrl` is a side effect plus an error. This one
 * covers the four prompts that come later, where nothing irreversible has
 * happened yet — defence in depth, not the whole guard.
 *
 * `login-prompts-are-never-invisible.test.ts` carries the arms, the mutants that
 * red for each half, and the deadline that names a hang.
 */
export interface Prompter {
  /** Ask one question, resolving with the line the user typed. */
  ask(question: string): Promise<string>;
  /** Release the readline interface. A no-op when nothing was ever asked. */
  close(): void;
}

export function createPrompter(): Prompter {
  // A single readline interface is shared across every prompt below, with
  // a line queue so input survives the async gaps between prompts.
  //
  // The old code opened a fresh `createInterface` per prompt and `close()`d
  // it immediately. On piped stdin the first close() left the stream at EOF,
  // so the second prompt's question() never resolved and the process exited
  // 0 without ever calling saveProfile(). Even a single shared interface is
  // not enough on its own: while we `await` the validation fetch between the
  // key prompt and the profile-name prompt, readline keeps draining the pipe
  // and emits/closes before the next question() attaches — losing the line
  // (and throwing "readline was closed"). Buffering every `line` event into
  // a queue lets a later ask() pick up a line that already arrived. If the
  // input ends before a prompt is answered we reject loudly instead of
  // silently exiting. (NEX-1879 defect 3)
  let rl: readline.Interface | undefined;
  const lineQueue: string[] = [];
  const waiters: Array<(line: string | null) => void> = [];
  let inputClosed = false;
  const ask = (question: string): Promise<string> => {
    // The SECOND gate, narrowed by the routing two lines below, for the prompts
    // that come after `resolveApiKey`'s own. Header: ROUTE, THEN GATE, UPSTREAM.
    if (askWouldHang()) {
      return Promise.reject(unseeableQuestionRefusal(question));
    }
    if (!rl) {
      rl = readline.createInterface({ input: stdin, output: promptStream() });
      rl.on("line", (line) => {
        const waiter = waiters.shift();
        if (waiter) waiter(line);
        else lineQueue.push(line);
      });
      rl.on("close", () => {
        inputClosed = true;
        while (waiters.length) (waiters.shift() as (l: string | null) => void)(null);
      });
    }
    promptStream().write(question);
    const buffered = lineQueue.shift();
    if (buffered !== undefined) return Promise.resolve(buffered);
    if (inputClosed) {
      return Promise.reject(new Error("Input ended before all prompts were answered."));
    }
    return new Promise<string>((resolve, reject) => {
      waiters.push((line) => {
        if (line === null) reject(new Error("Input ended before all prompts were answered."));
        else resolve(line);
      });
    });
  };

  return {
    ask,
    close: () => {
      rl?.close();
    }
  };
}

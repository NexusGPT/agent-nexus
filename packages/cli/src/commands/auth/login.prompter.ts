import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

/**
 * One prompt queue for a whole login run.
 *
 * `ask` and `close` share a single readline interface, so they must be taken
 * together from one `createPrompter()` call and closed by the same `finally`
 * that owns them. Splitting them apart re-creates NEX-1879 defect 3, described
 * inside the factory.
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
    if (!rl) {
      rl = readline.createInterface({ input: stdin, output: stdout });
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
    stdout.write(question);
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

import { exec } from "node:child_process";
import { stdin } from "node:process";
import readline from "node:readline/promises";

import { loadConfig, resolveBaseUrl, saveConfig } from "../config";
import { askWouldHang, promptLine, promptStream } from "../confirm.stream";

const SETTINGS_URL = "https://app.nexusgpt.io/app/settings/api-keys";

/** The one question this command asks, named so the refusals below can quote it. */
const KEY_PROMPT = "Paste your API key (nxs_...): ";

/**
 * {@link KEY_PROMPT} as a refusal quotes it — without the trailing punctuation a
 * prompt carries and a sentence does not.
 *
 * Extracted because TWO refusals quote it now: the gate below, which fires when
 * no stream can carry the question, and the input-ended path, which fires when
 * nothing can answer it. One spelling, so the two cannot drift apart.
 */
const PROMPTED_FOR = KEY_PROMPT.replace(/[\s:]+$/, "");

/**
 * Interactive login flow:
 *   1. Opens the API keys settings page in the browser
 *   2. Prompts for the API key
 *   3. Validates it against the API
 *   4. Saves to ~/.nexus-mcp/config.json
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus-mcp login > out.log` FROM A KEYBOARD BLOCKED ON A QUESTION SITTING
 *    IN THE LOG FILE. ONE REDIRECT WAS ENOUGH.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The readline interface's `output` was `stdout`, so `rl.question()` wrote the
 * question into out.log while stdin stayed a terminal — nothing in the run
 * doubted there was an operator to ask. The terminal showed nothing and the
 * process waited for a keystroke nobody had been shown.
 *
 * ── ROUTE FIRST, THEN GATE. THE ORDER IS THE DESIGN ─────────────────────────
 *
 * With the interface on `promptStream()`, stdout alone redirected puts the
 * question on the terminal and the login SUCCEEDS — the right outcome, since the
 * operator is right there and can answer. The gate then bites only where NO
 * stream can carry a question at all.
 *
 * 🔴 A GATE WITHOUT THE ROUTING turns that working ask into a refusal, and it
 * looks like a fix in any test that only asks "does it refuse".
 *
 * ── THE WHOLE DIALOGUE MOVES, NOT JUST THE QUESTION ─────────────────────────
 *
 * 🔴 ROUTING ONLY THE QUESTION MAKES IT UNANSWERABLE INSTEAD OF INVISIBLE, which
 * is the same defect one step later. The preamble names the page the key is
 * copied from; left on stdout it goes into out.log while
 * `Paste your API key (nxs_...):` sits on the terminal with no address beside
 * it. `confirm.stream.ts`'s `promptLine` draws the line this file follows: a
 * RESULT goes to `console.log`, because a caller parses it and a `>` redirect
 * exists to capture it — a QUESTION, its PREAMBLE and its ACKNOWLEDGEMENT go to
 * the prompt stream, because a person reads them.
 *
 * So `Opening …`, `Create or copy …` and `Validating...` move to the prompt
 * stream. `Logged in successfully…` is this command's RESULT and stays on
 * stdout. The three refusals were already on stderr and are unchanged.
 *
 * ── AND THE GATE IS NOT `canAsk()` ALONE ────────────────────────────────────
 *
 * `canAsk()` demands a terminal on STDIN too, and a pipe there WORKS here today:
 * measured, `printf 'nxs_…\n' | nexus-mcp login` resolves the question off the
 * pipe and saves the key. Nothing hangs in that run, because no question has to
 * be read by anybody. A bare `!canAsk()` gate would refuse every one of those
 * runs. So the gate is {@link askWouldHang} — `canAsk()`'s QUESTION half, asked
 * only when stdin is a terminal and a person is therefore waiting for something
 * to appear. It lives beside `canAsk` in the MIRRORED `confirm.stream.ts`, which
 * is what keeps this binary's gate and the CLI's two the same condition rather
 * than three that agree today.
 *
 * ── AND INPUT CAN END WITHOUT AN ANSWER, WHICH IS A THIRD STATE ─────────────
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 `nexus-mcp login < /dev/null` HUNG FOREVER. THE GATE ABOVE IS CORRECT AND
 *    CANNOT SEE IT: STDIN IS NOT A TERMINAL, SO IT DOES NOT FIRE — AND IT MUST
 *    NOT, BECAUSE A PIPE ON STDIN IS A SUPPORTED RUN.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `readline/promises`' `question()` NEVER SETTLES when input ends. Measured on
 * node v24.9.0 against a 1,500 ms bound: with stdin at EOF it neither resolves
 * nor rejects — and it stays pending through an explicit `rl.close()` too, so
 * closing the interface is not the escape either. The control resolves off a
 * pipe carrying a line, so the probe can tell the two apart. Reading node's own
 * `question()` says why: without an `options.signal` nothing but an answer calls
 * back, and `kQuestionReject` is stored and never reached by a close.
 *
 * What the interface DOES emit on input end is `close`. So the ask and the end
 * of input are RACED rather than sequenced, and the race is what turns a hang
 * into a refusal.
 *
 * 🔴 THE REFUSAL IS CONDITIONED ON INPUT ENDING *BEFORE* AN ANSWER, NEVER ON
 * STDIN NOT BEING A TERMINAL. `printf 'nxs_…\n' | nexus-mcp login` saves the key
 * today, and a fix that refused every non-TTY stdin would have replaced the hang
 * with a refusal of a shipped mode — which passes every arm that only asks "does
 * it refuse", exactly like the gate-without-the-routing above.
 *
 * ── WHY NOT THE CLI'S PROMPTER, WHICH SOLVED THIS FIRST ─────────────────────
 *
 * `packages/cli/src/commands/auth/login.prompter.ts` carries a line QUEUE and a
 * waiter list on the callback `node:readline` (NEX-1879 defect 3). It needs
 * them because it asks FIVE questions with a validation fetch between two of
 * them: readline keeps draining the pipe across that `await`, so a line can
 * arrive while no `question()` is attached and be lost. This command asks ONE
 * question, with nothing awaited before it — there is no gap for a line to
 * arrive into, so there is nothing to queue. The only property of that machinery
 * this site needs is the input-closed path, and `null` is deliberately the same
 * spelling it drains its waiters with.
 *
 * `login-prompts-are-never-invisible.test.ts` carries the arms, the mutants that
 * red for each half, and the deadline that names a hang instead of hanging.
 */
export async function loginCommand(args: string[]): Promise<void> {
  const envIndex = args.indexOf("--env");
  const envValue = envIndex !== -1 ? args[envIndex + 1] : undefined;

  // Pre-set dev base URL if requested
  const config = loadConfig();
  if (envValue) config.baseUrl = envValue === "dev" ? "http://localhost:3001" : undefined;
  const baseUrl = config.baseUrl ?? resolveBaseUrl();

  // The gate sits here rather than at the ask, because a login that is about to
  // refuse must not open a browser window and print a preamble first.
  if (askWouldHang()) {
    console.error(
      `Cannot ask "${PROMPTED_FOR}" — stdout and stderr are both ` +
        "redirected, so there is nowhere to show the question."
    );
    console.error(
      "Set NEXUS_API_KEY instead: it is read ahead of the config file, so no login is needed."
    );
    process.exitCode = 1;
    return;
  }

  // Step 1: Open browser to settings page
  if (stdin.isTTY) {
    promptLine(`Opening ${SETTINGS_URL} ...`);
    promptLine("Create or copy an API key from the settings page.\n");
    openUrl(SETTINGS_URL);
  } else {
    promptLine(`Create or copy an API key at ${SETTINGS_URL}\n`);
  }

  // Step 2: Prompt for the key
  const rl = readline.createInterface({ input: stdin, output: promptStream() });

  try {
    // Attached BEFORE the question is written, so an EOF already sitting on
    // stdin cannot close the interface in the gap between the two.
    const inputEnded = new Promise<null>((resolve) => {
      rl.once("close", () => resolve(null));
    });
    const answer = await Promise.race<string | null>([rl.question(KEY_PROMPT), inputEnded]);

    if (answer === null) {
      console.error(`No key entered: input ended before "${PROMPTED_FOR}" was answered.`);
      console.error(
        "Pipe one in instead:  printf 'nxs_...\\n' | nexus-mcp login — or set NEXUS_API_KEY, " +
          "which is read ahead of the config file, so no login is needed."
      );
      process.exitCode = 1;
      return;
    }

    const apiKey = answer.trim();

    if (!apiKey) {
      console.error("No key entered. Aborting.");
      process.exitCode = 1;
      return;
    }

    if (!apiKey.startsWith("nxs_")) {
      console.error('Invalid key format — API keys start with "nxs_".');
      process.exitCode = 1;
      return;
    }

    // Step 3: Validate the key with a lightweight API call
    promptLine("Validating...");
    const res = await fetch(`${baseUrl}/api/public/v1/agents?limit=1`, {
      headers: { "api-key": apiKey, Accept: "application/json" }
    });

    if (!res.ok) {
      console.error(`Validation failed (HTTP ${res.status}). Check your key and try again.`);
      process.exitCode = 1;
      return;
    }

    // Step 4: Save
    config.apiKey = apiKey;
    saveConfig(config);
    console.log("Logged in successfully. Config saved to ~/.nexus-mcp/config.json");
  } finally {
    rl.close();
  }
}

function openUrl(url: string): void {
  exec(openCommand(process.platform, url), { windowsHide: true });
}

function openCommand(platform: NodeJS.Platform, url: string): string {
  const quoted = JSON.stringify(url);
  if (platform === "darwin") return `open ${quoted}`;
  if (platform === "win32") return `start "" ${quoted}`;
  return `xdg-open ${quoted}`;
}

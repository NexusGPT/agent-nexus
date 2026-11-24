import { invalidInput } from "../../errors";
import type { CategorizedCliError } from "../../exit-codes";

/**
 * THE REFUSAL FOR AN `auth login` QUESTION NOBODY COULD HAVE READ, AND THE ONE
 * PROMPT STRING THE HOISTED GATE HAS TO QUOTE.
 *
 * It sits in its own module because TWO call sites need it and they are at
 * different DEPTHS of the same run: `login.prompter.ts`'s `ask`, which covers all
 * five prompts, and `login.resolve-key.ts`, which has to refuse BEFORE it opens a
 * browser window. A copy at either site is a second refusal message that agrees
 * today.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A REFUSAL AFTER AN IRREVERSIBLE ACT IS NOT A REFUSAL — IT IS A SIDE EFFECT
 *    PLUS AN ERROR.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The gate shipped inside `ask`, which runs AFTER `resolveApiKey` has printed the
 * settings preamble and called `openUrl`. So `nexus auth login >out.log 2>err.log`
 * from a keyboard OPENED A BROWSER WINDOW for a login that then exited 1. The
 * condition was right and the position was wrong, and no arm that only asks
 * "does it refuse" can see the difference.
 *
 * {@link askWouldHang} in `util/confirm.stream.ts` is the condition, in one place
 * for all three ask sites in the two published binaries. `nexus-mcp login` gates
 * before its own side effects and is what this site now matches.
 *
 * ── WHY AN ERROR, AND WHY IT IS NOT THROWN BY `ask` ─────────────────────────
 *
 * AN ERROR rather than a `string` return, because all five call sites read the
 * resolved value: handing back `""` reads as "the operator typed nothing" and is
 * reported as a second, wrong refusal. `invalidInput` is the thrown form of
 * `refuse`, so `handleError` prints the one `{"error":{message,hint,code}}`
 * document and returns the `invalid-input` code for `login.command.ts` to
 * assign — the invocation's own category, since it was typed in a way that
 * cannot be satisfied.
 *
 * ⚠️ `ask` RETURNS it and rejects with it, never throws it — `ask` is declared
 * `Promise<string>` and its other refusal already rejects, so a synchronous throw
 * would be invisible to `ask(q).catch(…)`. `resolveApiKey` is `async`, so a throw
 * there IS a rejection, and `login.command.ts`'s catch routes a
 * `CategorizedCliError` through `handleError` rather than restamping it
 * `local-failed`.
 *
 * The hint names the two flags that remove a prompt, and deliberately promises no
 * re-run that always works — a cross-org key with several memberships must still
 * be asked which organization to start on, and no flag answers that.
 */

/**
 * The key question, named once so the gate hoisted above `openUrl` refuses with
 * the same text `ask` would have printed.
 */
export const KEY_PROMPT = "Paste your API key (nxs_...): ";

/** The error for an ask whose question no stream could have carried. */
export function unseeableQuestionRefusal(question: string): CategorizedCliError {
  return invalidInput(
    `${question.replace(/[\s:]+$/, "")} — refusing with nowhere to show the question: ` +
      "stdout and stderr are both redirected.",
    "Answer the prompts in the invocation instead:  " +
      "nexus auth login --api-key nxs_... --profile <name>"
  );
}

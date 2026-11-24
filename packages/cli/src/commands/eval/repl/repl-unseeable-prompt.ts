import { invalidInput } from "../../../errors";
import type { CategorizedCliError } from "../../../exit-codes";

/**
 * THE REFUSAL FOR AN AUTHORING-REPL PROMPT NOBODY COULD HAVE READ, AND THE FIRST
 * PROMPT STRING THE HOISTED GATE HAS TO QUOTE.
 *
 * It sits in its own module because TWO call sites need it at different depths of
 * one session: `nextLine`, which every prompt in the REPL funnels through, and
 * `runAuthoringRepl` itself, which has to refuse BEFORE it creates anything
 * remote. A copy at either site is a second refusal message that agrees today.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 A REFUSAL AFTER AN IRREVERSIBLE ACT IS NOT A REFUSAL — AND HERE THE ACT IS
 *    A WRITE TO SOMEBODY ELSE'S ORGANIZATION.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The gate shipped as `nextLine`'s first statement, which runs AFTER
 * `goldenConversations.create`. So `nexus eval conv new … >out.log 2>err.log`
 * from a keyboard LEFT A REMOTE DRAFT CONVERSATION BEHIND and then threw
 * `invalid-input`. Worse than `auth login`'s browser window, which costs a
 * window: this one costs a row the operator has to find and delete, in an org the
 * CLI reaches over the network. The condition was right and the position was
 * wrong, and no arm that only asks "does it refuse" can see the difference.
 *
 * {@link askWouldHang} in `util/confirm.stream.ts` is the condition, in one place
 * for all three ask sites in the two published binaries, and carries why it is
 * not `!canAsk()`: scripted stdin is a PUBLISHED mode here — `new.command.ts`'s
 * help says "SCRIPTED STDIN WORKS", the CHANGELOG shipped the promise — and a
 * pipe hangs on nothing.
 *
 * ── WHY IT IS THROWN AND NOT RETURNED AS `null` ─────────────────────────────
 *
 * `null` is this REPL's end-of-input signal, so returning it would finish the
 * session silently under a cheerful closing line — a second wrong outcome rather
 * than a refusal. `invalidInput` is the thrown form of `refuse`, so
 * `new.command.ts`'s existing `handleError` catch prints the one
 * `{"error":{message,hint,code}}` document and assigns `invalid-input`, the
 * invocation's own category. That command file needs no change: it already
 * forwards `handleError`'s return instead of restamping it.
 *
 * Unlike `auth login` no flag can answer these prompts — the REPL IS the
 * prompts — so the hint names the pipe the published contract already promises.
 */

/**
 * The first prompt of a session, named once so the gate hoisted above
 * `goldenConversations.create` refuses with the same text `nextLine` would have
 * written.
 */
export const USER_PROMPT = "you › ";

/** The error for a prompt whose question no stream could have carried. */
export function unseeablePromptRefusal(prompt: string): CategorizedCliError {
  return invalidInput(
    `${prompt.replace(/[\s›:]+$/u, "")} — refusing with nowhere to show the prompt: ` +
      "stdout and stderr are both redirected.",
    "Pipe the session in instead of typing it:  " +
      "printf 'your message\\na\\nd\\n' | nexus eval conv new --agent-id ... --deployment-id ... --title \"...\""
  );
}

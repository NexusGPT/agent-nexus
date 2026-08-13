import type { Command, Option } from "commander";

/**
 * THERE IS ONE STANDARD INPUT. TWO FLAGS ASKING FOR IT IS REFUSED, NOT RESOLVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT IT DID BEFORE, MEASURED ON THE WIRE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   $ echo '{"firstName":"Ada","lastName":"L","role":"A"}' \
 *       | nexus agent create --body - --prompt -
 *
 *   exit: 0
 *   wire: (NO REQUEST)
 *   out : (NOTHING PRINTED)
 *
 * Both orders, same result. Each flag ALONE works and sends a correct request;
 * together the command exits successfully having done nothing at all, printing
 * neither an error nor a success line. A script reading `$?` is told it worked.
 *
 * ── THE MECHANISM ────────────────────────────────────────────────────────────
 *
 * `readStdin()` attaches `data`/`end` listeners to `process.stdin`. The first
 * caller consumes the stream. The second attaches to a stream that has ALREADY
 * emitted `end`, so `end` never fires again and its promise never settles. That
 * promise is not holding a handle open, so Node's event loop simply drains and
 * the process exits 0 mid-flight — after the argument parsing that would have
 * complained, and before the HTTP call that would have shown up anywhere.
 *
 * There are two independent `readStdin()` call sites reachable in one
 * invocation — `resolveInputValue` for `--prompt` / `--message` / `--content`,
 * and `resolveRequiredBody` for `--body` / `--data` — so no memo on one of them
 * can close this. Memoizing `resolveRequiredBody` prevents the BODY being read
 * twice, which is a different bug and is fixed; it does not and cannot stop a
 * second flag reaching the other reader.
 *
 * ── WHY REFUSE RATHER THAN SHARE THE BYTES ───────────────────────────────────
 *
 * Handing both flags the same stdin document is the other available fix and it
 * is worse. One document is not a JSON request body AND a system prompt at the
 * same time, so satisfying both means one of them silently receives something
 * the operator never meant to give it. That is a guess about intent, dressed as
 * a success. Refusing is the only outcome that cannot be wrong.
 *
 * ── WHY THIS CANNOT FIRE ON A WORKING COMMAND ────────────────────────────────
 *
 * It needs TWO options, both declared stdin-capable, both set to exactly `"-"`,
 * in one invocation. At most one of those can ever be served. So every command
 * this refuses is a command that was already going to fail — the only change is
 * that it now says so.
 */

/**
 * Does this option accept `-` as "read standard input"?
 *
 * Both spellings the package uses, because it uses both: the placeholder
 * (`<file-or-->`, `<text-or->`, `<json-or-file-or-->`) and the description
 * clause (`… or '-' for stdin`), which is how `--body <json>` declares it.
 */
function readsStdin(option: Option): boolean {
  return /-or-{1,2}>/.test(option.flags) || /'-' for stdin/.test(option.description);
}

/** Every long flag on this command currently set to the literal `-`. */
export function stdinClaimants(command: Command): string[] {
  const opts = command.opts();
  return command.options
    .filter((option) => readsStdin(option) && opts[option.attributeName()] === "-")
    .map((option) => option.long ?? option.flags);
}

export function tooManyStdinReadersMessage(flags: readonly string[]): string {
  return (
    `error: ${flags.join(" and ")} both read standard input, and there is only one. ` +
    `Pass "-" to at most one of them; give the other a literal value or a file path.`
  );
}

/**
 * Refuse any invocation with two flags claiming stdin. Call ONCE from
 * `index.ts`, and BEFORE `applyBodySatisfiesRequired` — commander runs
 * `preAction` hooks in registration order, and that seam's hook READS the body,
 * which is one of the two claimants. Registering this first is what makes the
 * refusal land before anything consumes the stream.
 */
export function refuseMultipleStdinReaders(root: Command): void {
  const walk = (command: Command): void => {
    if (command.options.filter(readsStdin).length > 1) {
      command.hook("preAction", (_thisCommand, actionCommand) => {
        const claimants = stdinClaimants(actionCommand);
        if (claimants.length > 1) {
          actionCommand.error(tooManyStdinReadersMessage(claimants), {
            code: "nexus.tooManyStdinReaders"
          });
        }
      });
    }
    for (const child of command.commands) walk(child);
  };
  walk(root);
}

import path from "node:path";

import { color, isJsonMode } from "../../output";
import { askLine } from "../../util/ask";
import { type ClaudeTarget, resolveClaudeTarget } from "../../util/claude-target";
import { promptLine, promptStream } from "../../util/confirm";
import { type SkillsInstallOpts } from "../claude-code";
import { describeReason } from "./_shared/describe-reason";

/**
 * When the auto-detected root differs from where the user is standing, ask
 * which location they mean. This is the "intelligent and/or interactive enough
 * to know where the claude files sit" requirement — and the guard against
 * writing into the wrong folder. Non-interactive runs (or --yes/--force) keep
 * the detected default.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 IT DECIDES ON STDIN, AND IT USED TO DECIDE ON STDOUT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This is not the destructive confirmation — that one lives in
 * `runSkillsInstallToTarget` and has always gone through `confirmDestructive`.
 * It is the OTHER question this command asks, and it carried the exact defect
 * `util/confirm` exists to delete, three ways over:
 *
 *   - `nexus skills update > log` from a real keyboard. stdout is a pipe, so the
 *     picker was skipped and dozens of files went to the detected root with
 *     nobody asked which root that was.
 *   - `echo 2 | nexus skills update` at a terminal. stdout is a terminal, so it
 *     asked — and consumed an answer arriving from a script rather than a person.
 *   - `nexus skills update < /dev/null` at a terminal. It asked, stdin had
 *     already ended, and nothing could ever settle the promise. The question
 *     printed and the process sat there.
 *
 * A question is answered on STDIN, so stdin is the only stream that says whether
 * anyone can answer. And the question goes to {@link promptStream} — stderr in
 * every case a person can read it — so redirecting stdout no longer hides the
 * prompt behind the wait.
 */
export async function maybePickLocation(
  detected: ClaudeTarget,
  opts: SkillsInstallOpts,
  cwd: string,
  homeDir: string
): Promise<ClaudeTarget | null> {
  const here = path.resolve(cwd);
  const isExplicit = Boolean(opts.dir || opts.global || opts.here);
  const sameAsHere = detected.projectRoot === here;

  // Nothing to disambiguate: explicit flag, already in the root, --json (the
  // picker would block on stdin and corrupt the JSON document), --yes/--force,
  // or nobody is there to answer. Detection stands.
  if (isExplicit || sameAsHere || isJsonMode() || opts.yes || opts.force || !process.stdin.isTTY) {
    return detected;
  }

  // THE OPTIONS GO WHERE THE QUESTION GOES. They are what the answer refers to;
  // on `console.log` with stdout redirected the operator is asked to choose
  // between three paths and shown none of them.
  promptLine(
    color.bold("\nWhere should the skills go?\n") +
      color.dim(`  Detected: ${describeReason(detected.reason, detected.projectRoot)}\n`)
  );
  promptLine(
    `  ${color.cyan("1")}  ${detected.projectRoot}   ${color.dim("(detected — default)")}`
  );
  promptLine(`  ${color.cyan("2")}  ${here}   ${color.dim("(current directory)")}`);
  promptLine(`  ${color.cyan("3")}  ${path.join(homeDir, ".claude")}   ${color.dim("(global)")}`);
  promptLine();

  // `askLine`, not `askYesNo`: this is a 1/2/3 choice, not a confirmation, so
  // it renders its own bracket and reads its own answer. What it shares with
  // the y/N sites is only the interface's lifetime — closed in a `finally`,
  // because an interface left open holds stdin and the process never exits.
  // This site already got that right; it is here so there is one copy of it.
  const answer = await askLine("Choose [1/2/3, default 1]: ", promptStream());

  switch (answer) {
    case "":
    case "1":
      return detected;
    case "2":
      return resolveClaudeTarget({ ...opts, here: true }, cwd, homeDir);
    case "3":
      return resolveClaudeTarget({ ...opts, global: true }, cwd, homeDir);
    default:
      promptLine(color.yellow("Unrecognized choice — aborting. Re-run and pick 1, 2, or 3."));
      return null;
  }
}

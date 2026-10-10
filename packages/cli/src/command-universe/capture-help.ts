/**
 * THE ONE FUNNEL every rendered `--help` capture goes through.
 *
 * Its own file BECAUSE it is the single funnel, which is a property worth
 * being able to point at: the docs model, the pages and the gate that compares
 * them all capture through this function, so none of the three can drift from
 * the others. A second copy of the save/restore dance below could restore
 * differently and make two sides differ for a reason that has nothing to do
 * with the tree.
 *
 * WHAT BELONGS HERE: the capture itself and the reasoning about what makes a
 * capture a function of the TREE ALONE — the `asDerivedCapture` wrapper is what
 * keeps a process-dependent fact out of the bytes.
 *
 * WHAT DOES NOT: a second capture path, and no caller-side variation. A caller
 * that needs different text needs a different TREE, not a second funnel.
 */

import type { Command } from "commander";

import { asDerivedCapture } from "../util/version-check";

/**
 * Render a command's help exactly as a terminal would receive it.
 *
 * 🚨 `helpInformation()` IS NOT THIS. It stops at the options table and omits
 * every `addHelpText` block — the hand-written Notes and Examples, which are the
 * highest-value prose on the surface. Measured against commander 13 on `apps`:
 * `helpInformation()` does not contain its `Subcommands:` epilogue and a capture
 * of `outputHelp()` does.
 *
 * The save/restore goes through the PUBLIC `configureOutput()`, but the saved
 * value must be a COPY. `configureOutput()` with no argument hands back the
 * live `_outputConfiguration` object and `configureOutput(x)` `Object.assign`s
 * into that same object — so keeping the reference and passing it back restores
 * nothing, because the reference already holds the overrides.
 *
 * EXPORTED for the byte-identity gate, which captures the real root program's
 * command at each documented path and compares. One copy of this save/restore
 * dance, deliberately: a second one in the test could restore differently and
 * make the two sides differ for a reason that has nothing to do with the tree.
 *
 * 🚨 A CAPTURE IS A FUNCTION OF THE TREE ALONE, AND THIS IS THE ONLY PLACE
 * THAT DECIDES IT. `helpScopeFooter` renders two facts that are true of the
 * running PROCESS rather than of the tree: the staleness notice, read from
 * `~/.nexus-mcp/version-check.json` at RENDER time, and the CLI version, read
 * from a `package.json` field the release writes on `main` and never on
 * `staging`. An unwrapped capture bakes both in. See {@link asDerivedCapture}
 * for the measurement behind each. Putting it here rather than at each call
 * site is the point: this function is the one funnel every derived capture goes
 * through — the docs model, the pages, and the gate that compares them — so
 * none of the three can drift from the others.
 */
export function captureHelp(command: Command): string {
  let buffer = "";
  const previous = { ...command.configureOutput() };
  command.configureOutput({
    writeOut: (text: string) => {
      buffer += text;
    },
    writeErr: () => {}
  });
  try {
    asDerivedCapture(() => command.outputHelp());
  } finally {
    command.configureOutput(previous);
  }
  return buffer.trimEnd();
}

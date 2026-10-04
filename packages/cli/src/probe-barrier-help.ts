/**
 * THE HELP LINE the probe barrier renders, and the walk that installs it.
 *
 * Split out of `probe-barrier.ts`, which is the TABLE and nothing else. The
 * separation is not cosmetic: that table is a 500-row declaration a person
 * maintains by hand, while everything here is CODE — a wrapper, a formatter and
 * a registrar over the whole command tree. Held in one file, the only cap that
 * could ever be armed on the pair would have to be sized for the table, which
 * is the size at which a registrar grows without anybody seeing it.
 *
 * So the table earns its exemption by having no functions left in it, and this
 * module is small enough to be gated like any other registrar.
 *
 * Nothing about what is rendered changed in the move. The strings, the wrap
 * width and the walk are the same bytes they were in `probe-barrier.ts`.
 */

import type { Command } from "commander";

import { PROBE_BARRIER, type ProbeBarrierEntry } from "./probe-barrier";

/**
 * The stable half of the sentence.
 *
 * Exported for the same reason `KNOWN_ISSUES_HELP_PREFIX` is: a gate asserting
 * against a second copy typed into a test lets the line be reworded into
 * uselessness with the gate still green.
 */
export const PROBE_BARRIER_HELP_PREFIX = "Probe barrier";

/**
 * Wrap to the width the rest of this CLI's help is written to.
 *
 * The `why` and `safeCheck` strings are DATA, so they cannot be hand-wrapped in
 * the table the way a `Notes:` block is hand-wrapped in a command file. Left
 * unwrapped they render as one long line that a narrow terminal breaks at an
 * arbitrary column, mid-word, with no indent — which reads as a rendering
 * fault and undermines the one line whose whole job is to be believed.
 */
function wrap(text: string, indent: string): string {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    if (current === "") current = word;
    else if (`${current} ${word}`.length + indent.length <= 78) current = `${current} ${word}`;
    else {
      lines.push(indent + current);
      current = word;
    }
  }
  if (current !== "") lines.push(indent + current);

  return lines.join("\n");
}

/** The line, for one entry. Exported so the gate asserts one string, not a copy of it. */
export function probeBarrierHelpLine(entry: ProbeBarrierEntry): string {
  const body =
    `This command ${entry.why}. Checking the notes above therefore costs something ` +
    `a reader may not want to spend, so treat them as UNVERIFIED rather than as ` +
    `observed behaviour.`;

  const safe =
    entry.safeCheck === undefined
      ? ""
      : `\n${wrap(`Safe check without paying it: ${entry.safeCheck}`, "  ")}`;

  return (
    `\n${PROBE_BARRIER_HELP_PREFIX} — ${entry.barrier.toUpperCase()}` +
    `\n${wrap(body, "  ")}` +
    safe
  );
}

/**
 * Install the line on every barrier'd command in the tree.
 *
 * Call LAST in `buildRootProgram`, after every registrar, or the commands
 * registered afterwards are not in the tree this walks.
 *
 * The walk is the whole population and the table is the filter, which is the
 * same shape as `known-issues-help.ts`: there is no list of participating
 * commands to keep in step, and a namespace added tomorrow is walked whether or
 * not anyone remembered this file.
 */
export function applyProbeBarrierHelpLine(program: Command): void {
  const visit = (command: Command, prefix: readonly string[]): void => {
    const path = command.parent ? [...prefix, command.name()] : [];
    const children = (command.commands as Command[]).filter((c) => c.name() !== "help");

    if (children.length === 0) {
      const entry = PROBE_BARRIER[path.join(" ")];
      if (entry !== undefined) command.addHelpText("after", probeBarrierHelpLine(entry));
    }

    for (const child of children) visit(child, path);
  };

  visit(program, []);
}

import { Command } from "commander";
import { describe, expect, it } from "vitest";

import { registerFolderCommands } from "./folder";
import { registerRoleCommands } from "./role";
import { registerTicketCommands } from "./ticket";
import { registerTracingCommands } from "./tracing";
import { registerVersionCommands } from "./version";
import { registerWorkspaceCommands } from "./workspace";

/**
 * THE FINISH LINE FOR THE `--help` COMPLETENESS PROGRAMME (NEX-3626).
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THE STANDARD IS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--help` carries exactly the instruction a prompt would carry, in FULL. The
 * bar is operational: paste a command's `--help` into an agent prompt with no
 * other source available, and the agent must use it correctly FIRST TIME —
 * including the cases where it would otherwise silently do the wrong thing.
 *
 * That bar cannot be asserted by a machine. What CAN be asserted is the shape
 * every entry written to it has, and that is what this file does: a converted
 * namespace keeps a group-level epilogue, and EVERY one of its subcommands
 * carries an `Examples:` block with a runnable invocation and a `Notes:` block.
 * The judgement stays with the reviewer; the regression does not.
 *
 * ── WHY AN EXPLICIT LIST AND NOT A SWEEP ─────────────────────────────────────
 *
 * The programme lands one namespace at a time, so a sweep over all 32 would be
 * red from the first commit to the last and would be deleted long before it
 * went green. The list below is the set already converted, and the ratio of its
 * length to 32 is the programme's progress.
 *
 * ⚠️ ADDING A NAMESPACE HERE IS THE LAST STEP OF CONVERTING IT, NOT THE FIRST,
 * and REMOVING one is never how a build is fixed — a namespace regressing out
 * of the standard is the exact event this file exists to catch.
 *
 * `role` is listed as the MODEL rather than as work done: it was written to the
 * standard before the programme existed and every other entry copies its form.
 * If `role` fails here, the form itself has drifted.
 */
const CONVERTED_NAMESPACES: readonly {
  readonly name: string;
  readonly register: (program: Command) => void;
}[] = [
  { name: "role", register: registerRoleCommands },
  { name: "folder", register: registerFolderCommands },
  { name: "ticket", register: registerTicketCommands },
  { name: "tracing", register: registerTracingCommands },
  { name: "version", register: registerVersionCommands },
  { name: "workspace", register: registerWorkspaceCommands }
];

/**
 * Build one namespace and hand back its top-level command.
 *
 * A fresh `Command` per namespace rather than one shared program: commander
 * mutates the parent on registration, and a shared root would let one
 * namespace's failure read as another's.
 */
function buildNamespace(entry: (typeof CONVERTED_NAMESPACES)[number]): Command {
  const program = new Command();
  program.name("nexus").exitOverride();
  entry.register(program);

  const group = program.commands.find((cmd) => cmd.name() === entry.name);
  if (!group) {
    throw new Error(`"${entry.name}" registered no command called "${entry.name}"`);
  }
  return group;
}

/**
 * The bytes a caller actually reads from `--help`.
 *
 * `outputHelp()` and NOT `helpInformation()`: only the former runs the
 * `addHelpText` handlers, and the epilogue those register is where every fact
 * this file checks for lives. Asserting on `helpInformation()` would pass on a
 * command whose Notes block was deleted.
 */
function helpText(command: Command): string {
  let captured = "";
  command.configureOutput({
    writeOut: (str: string) => {
      captured += str;
    },
    writeErr: (str: string) => {
      captured += str;
    }
  });
  command.outputHelp();
  return captured;
}

/** Just the authored epilogue — what `addHelpText` contributed, nothing else. */
function epilogue(command: Command): string {
  return helpText(command).replace(command.helpInformation(), "").trim();
}

describe("--help completeness (NEX-3626)", () => {
  for (const entry of CONVERTED_NAMESPACES) {
    describe(`nexus ${entry.name}`, () => {
      const group = buildNamespace(entry);

      it("the group help carries an authored epilogue, not just a command list", () => {
        // A bare usage + command list is the exact failure this programme
        // exists to remove, so require that something was written beyond the
        // machinery commander generates for free.
        expect(
          epilogue(group).length,
          `nexus ${entry.name} --help has no authored epilogue`
        ).toBeGreaterThan(200);
      });

      for (const sub of group.commands) {
        const label = `nexus ${entry.name} ${sub.name()}`;

        it(`${label} --help carries Examples and Notes`, () => {
          const text = helpText(sub);
          expect(text, `${label} --help has no Examples: block`).toContain("Examples:");
          expect(text, `${label} --help has no Notes: block`).toContain("Notes:");
          // An `Examples:` heading with nothing runnable under it satisfies the
          // check above and helps nobody.
          expect(text, `${label} --help lists no runnable example`).toMatch(
            new RegExp(`\\$ nexus ${entry.name}\\b`)
          );
        });
      }
    });
  }
});

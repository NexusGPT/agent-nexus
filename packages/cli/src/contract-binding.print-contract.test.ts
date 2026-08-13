import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { bindCommand } from "./contract-binding";
import type { ProjectedDescriptor } from "./contract-help.render";

/**
 * `--print-contract` HAS TO WORK ON A COMMAND WITH A REQUIRED OPTION.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE FLAG WAS DEAD ON EXACTLY THE COMMANDS THAT NEEDED IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `bindCommand` read the flag in a `preAction` hook, and commander enforces
 * `.requiredOption()` inside `_parseCommand` BEFORE any action hook runs. So on
 * `role create-job-type` — whose entire subject is a required `--body` — the
 * flag answered `error: required option '--body <json>' not specified` and
 * exited 1, while the help block six lines above it printed *"Use
 * --print-contract for the full list."*
 *
 * That is a false instruction in shipped output, on the one route where the
 * summary genuinely withholds something: `Body.parts[].unit` is a nested field,
 * the block renders `Not shown: 4 nested field(s)`, and the flag was the only
 * way to see it. A caller who cannot see `parts[].unit` cannot compose a body
 * the server accepts.
 *
 * ⚠️ THE CONTROL IS THE SECOND CASE, AND IT IS NOT DECORATION. A command with no
 * required option printed the contract under the OLD implementation too, so a
 * suite holding only that case is green against the defect. Both cases together
 * are what separate "the flag works" from "the flag works where it was never
 * broken".
 */

const SHAPE = {
  name: "Thing",
  method: "POST",
  route: "/public/v1/things",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.parts", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.parts[].unit", slot: "Body", type: "string", required: true, depth: 1 }
  ]
} as const satisfies ProjectedDescriptor;

/**
 * Parse `argv` against a freshly built command and return what reached stdout.
 *
 * `process.exit` is stubbed to throw rather than mocked to a no-op: the real
 * implementation exits, so letting parsing continue past it would test a code
 * path that cannot happen. The throw is caught and reported as the exit code.
 */
function parse(
  argv: readonly string[],
  build: (command: Command) => void
): { readonly stdout: string; readonly exitCode: number | "no-exit"; readonly stderr: string } {
  const program = new Command();
  program.name("nexus").exitOverride();
  const command = program.command("thing");
  build(command);
  command.action(() => undefined);
  bindCommand(command, SHAPE);

  const stdout: string[] = [];
  const stderr: string[] = [];
  const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  let exitCode: number | "no-exit" = "no-exit";
  const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error("__exit__");
  }) as never);

  command.configureOutput({
    writeErr: (str) => stderr.push(str),
    writeOut: (str) => stdout.push(str)
  });

  try {
    program.parse(["node", "nexus", "thing", ...argv]);
  } catch (error) {
    if (error instanceof Error && error.message !== "__exit__") {
      stderr.push(error.message);
    }
  } finally {
    write.mockRestore();
    exit.mockRestore();
  }

  return { stdout: stdout.join(""), exitCode, stderr: stderr.join("") };
}

describe("--print-contract", () => {
  it("prints the full contract on a command whose --body is REQUIRED", () => {
    const result = parse(["--print-contract"], (command) => {
      command.requiredOption("--body <json>", "The whole thing as JSON");
    });

    expect(result.stderr).not.toContain("required option");
    expect(result.exitCode).toBe(0);
    // The nested field the summary block hides behind `Not shown: N nested
    // field(s)` — the whole reason a caller reaches for this flag.
    expect(result.stdout).toContain("Body.parts[].unit");
  });

  it("still prints it on a command with no required option — the control", () => {
    const result = parse(["--print-contract"], (command) => {
      command.option("--body <json>", "The whole thing as JSON");
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Body.parts[].unit");
  });

  it("leaves the required-option refusal alone when the flag is absent", () => {
    const result = parse([], (command) => {
      command.requiredOption("--body <json>", "The whole thing as JSON");
    });

    // Reading the flag earlier must not weaken the check it steps around: a
    // caller who simply forgot --body is still refused, and never runs.
    expect(result.stderr).toContain("required option");
    expect(result.stdout).not.toContain("Body.parts[].unit");
  });
});

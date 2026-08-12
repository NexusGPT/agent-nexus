import { RolesResource } from "@agent-nexus/sdk";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { COVERAGE_INPUTS_NOTE, JOB_MODEL_DOES_NOT_MOVE_COVERAGE } from "./role-coverage-copy";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("../client", () => ({
  createClient: () => ({ roles: new RolesResource({ request } as never) })
}));

import { registerRoleCommands } from "./role";

/**
 * THE HELP TEXT MAY NOT PROMISE AN EFFECT THE SERVER DOES NOT HAVE.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS PINS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A Role carries two cost models. COVERAGE is derived on the server from the
 * Role's workload, each held system's impact model, and the organization's
 * automation settings. THE JOB MODEL — the Scope, the job-type library, the
 * Role's variables, its working year — is stored by the server, read by the
 * server for nothing, and evaluated in a browser.
 *
 * `nexus role`'s help conflated them in five places and told a caller that
 * writing the Scope authors the workload and moves coverage. He wrote every
 * input the public API exposes on one Role, read them all back correctly, and
 * the figure did not move. Nothing was broken; the copy was wrong, and it was
 * wrong in the one direction that costs an afternoon — it promised an effect.
 *
 * ── WHY THIS IS A TEST AND NOT A REVIEW NOTE ─────────────────────────────────
 *
 * Three of the five wrong statements were not in the bug report. They were
 * found by reading every job-model command rather than the three the reporter
 * happened to hit, and they are the same conflation wearing different words:
 * `set-working-year` claimed to produce "different coverage denominators",
 * `delete-job-type` claimed to change "coverage and money figures", and
 * `update-job-type` told the caller to re-read coverage after a write. A rule
 * over the whole namespace catches the fourth spelling; a fix to five strings
 * does not.
 *
 * ── WHAT THIS FILE CAN AND CANNOT PROVE ──────────────────────────────────────
 *
 * It proves WHERE the statements appear, in the bytes a caller actually reads.
 * It cannot prove they are TRUE — it imports them, so gutting the constant
 * would keep the placement assertions green. Two things cover that: the
 * independent literal assertions on `nexus role coverage` below, which do not
 * go through the constant, and
 * `apps/backend/src/__governance__/role-coverage-inputs-are-the-documented-three.spec.ts`,
 * which derives the coverage input set from the use case and goes red naming
 * `role-coverage-copy.ts` the day that set moves.
 */

/**
 * The `--help` a caller actually reads.
 *
 * `outputHelp()` and NOT `helpInformation()`: only the former runs the
 * `addHelpText("after")` handlers, and every statement this file checks for
 * lives in one. A test built on `helpInformation()` passes against a command
 * whose whole Notes block was deleted.
 */
function renderHelp(name: string): string {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerRoleCommands(program);

  const group = program.commands.find((cmd) => cmd.name() === "role");
  if (!group) throw new Error("registerRoleCommands registered no `role` command");

  const command = group.commands.find((cmd) => cmd.name() === name);
  if (!command) throw new Error(`No such command: nexus role ${name}`);

  const chunks: string[] = [];
  command.configureOutput({
    writeOut: (str: string) => chunks.push(str),
    writeErr: (str: string) => chunks.push(str)
  });
  command.outputHelp();
  return chunks.join("");
}

/**
 * Help text is hard-wrapped by hand and by commander, so every comparison here
 * is made on one line. Without this a correct sentence fails on a line break
 * somebody moved, which is the kind of red that gets a test deleted.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The commands that WRITE the job model.
 *
 * Each one promises an effect, which is what made the wrong copy expensive: a
 * read that is silent about coverage misleads nobody, and a write that claims
 * coverage moves sends the caller looking for a figure that will never change.
 */
const JOB_MODEL_WRITES = [
  "create-job-type",
  "update-job-type",
  "delete-job-type",
  "set-scope-lines",
  "set-variables",
  "set-working-year",
  "set-system-policy"
] as const;

/** The job-model READS. Silent about coverage is the requirement here. */
const JOB_MODEL_READS = [
  "job-types",
  "scope-lines",
  "variables",
  "working-year",
  "system-policy"
] as const;

/**
 * The two commands that genuinely DO reach a coverage input.
 *
 * `OrganizationAutomationSettings` is one of the three rows the engine divides
 * by, so these two must NOT carry the disclaimer. Without this direction a
 * sweep that pasted the paragraph onto every command in the namespace would
 * pass while telling a caller the one write that works does nothing.
 */
const COVERAGE_INPUT_COMMANDS = ["automation-settings", "set-automation-settings"] as const;

const JOB_MODEL_COMMANDS = [...JOB_MODEL_WRITES, ...JOB_MODEL_READS] as const;

describe("nexus role — job-model help never promises a coverage effect", () => {
  it("every command this file names is registered", () => {
    // A typo in a list above would test nothing and report nothing. Resolving
    // each name through `renderHelp`, which throws on a miss, is what makes the
    // per-command assertions below evidence rather than a spelling exercise.
    for (const name of [...JOB_MODEL_COMMANDS, ...COVERAGE_INPUT_COMMANDS, "coverage"]) {
      expect(renderHelp(name).length, `nexus role ${name} rendered no help`).toBeGreaterThan(0);
    }
  });

  it.each(JOB_MODEL_WRITES)("nexus role %s --help states it does not move coverage", (name) => {
    expect(
      flat(renderHelp(name)),
      `nexus role ${name} writes the job model and does not say the coverage read is unaffected`
    ).toContain(flat(JOB_MODEL_DOES_NOT_MOVE_COVERAGE));
  });

  it.each(JOB_MODEL_COMMANDS)("nexus role %s --help makes no other coverage claim", (name) => {
    // Strip the one sanctioned mention, then require silence. Any survivor is a
    // second statement about coverage on a command that cannot affect it —
    // which is the whole defect, in whatever words the next author picks.
    const remainder = flat(renderHelp(name)).replace(flat(JOB_MODEL_DOES_NOT_MOVE_COVERAGE), "");

    expect(
      remainder,
      `nexus role ${name} talks about coverage outside the one sanctioned statement`
    ).not.toMatch(/coverage/i);
  });

  it.each(JOB_MODEL_COMMANDS)("nexus role %s --help does not call the Scope a workload", (name) => {
    // "Workload" names exactly one thing: `RoleWorkload`, the coverage
    // denominator, which none of these commands touches. Borrowing the word for
    // the Scope is the conflation itself rather than a symptom of it.
    const remainder = flat(renderHelp(name)).replace(flat(JOB_MODEL_DOES_NOT_MOVE_COVERAGE), "");

    expect(
      remainder,
      `nexus role ${name} uses "workload" for something that is not the coverage denominator`
    ).not.toMatch(/workload/i);
  });

  it.each(COVERAGE_INPUT_COMMANDS)("nexus role %s --help does NOT carry the disclaimer", (name) => {
    expect(
      flat(renderHelp(name)),
      `nexus role ${name} reaches a real coverage input and must not deny it`
    ).not.toContain(flat(JOB_MODEL_DOES_NOT_MOVE_COVERAGE));
  });
});

describe("nexus role coverage — the help names its own inputs", () => {
  it("carries the inputs statement", () => {
    expect(flat(renderHelp("coverage"))).toContain(flat(COVERAGE_INPUTS_NOTE));
  });

  it("names all three inputs, independently of the constant", () => {
    // These literals do not go through `COVERAGE_INPUTS_NOTE`, so a rewrite
    // that guts it while keeping its name is caught here.
    const help = flat(renderHelp("coverage"));

    expect(help, "the workload is unnamed").toMatch(/WORKLOAD/);
    expect(help, "the per-system impact model is unnamed").toMatch(/IMPACT/);
    expect(help, "the organization's automation settings are unnamed").toMatch(
      /AUTOMATION SETTINGS/
    );
  });

  it("names the one input this API can write, and where the other two are authored", () => {
    const help = flat(renderHelp("coverage"));

    expect(help, "the writable input is not named as a command").toContain(
      "nexus role set-automation-settings"
    );
    expect(help, "the caller is not told where the other two are authored").toMatch(
      /dashboard.*General tab/i
    );
  });

  it("states the two absent writes are a refusal rather than a gap", () => {
    // A caller who reads "not supported yet" retries next release. The reporter
    // asked for exactly this sentence: a route, or a statement that there will
    // not be one.
    expect(flat(renderHelp("coverage")), "the absence reads as an omission").toMatch(
      /absent from the public API deliberately/i
    );
  });

  it("keeps the two statements that were already correct", () => {
    // This command's original Notes block was right and is not what was fixed.
    // Appending to it must not become rewriting it.
    const help = flat(renderHelp("coverage"));

    expect(help, 'the "not modelled is not 0%" statement was dropped').toMatch(
      /"not modelled" is NOT 0% and NOT 100%/
    );
    expect(help, "the necessary-and-not-sufficient permission statement was dropped").toMatch(
      /NECESSARY AND NOT SUFFICIENT/
    );
  });
});

/**
 * The warning a caller reads at WRITE time, which no help assertion can reach.
 *
 * `nexus role update-job-type` prints a stderr warning when the write repriced
 * other Roles' scope lines, and that warning told the reader to "re-read the
 * affected Roles' coverage". Same false promise as the help, on a surface the
 * help tests are structurally blind to: `printWarning` writes to `process.stderr`
 * and fires only on a non-zero `repricedScopeLines`, so it appears in no
 * `--help` output and on no run that repriced nothing.
 */
describe("nexus role update-job-type — the reprice warning points at the right figure", () => {
  async function runCapturingStderr(argv: readonly string[]): Promise<string> {
    const program = new Command();
    program.name("nexus").exitOverride();
    registerRoleCommands(program);
    setJsonMode(false);

    const chunks: string[] = [];
    const write = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      await program.parseAsync(["node", "nexus", ...argv]);
    } finally {
      process.stderr.write = write;
      setJsonMode(true);
    }
    return chunks.join("");
  }

  const JOB_TYPE_ID = "6666aaaa-0000-4000-8000-000000000001";

  it("warns about the scope lines it repriced and not about coverage", async () => {
    request.mockResolvedValue({
      jobType: { id: JOB_TYPE_ID, name: "Support agent" },
      repricedScopeLines: 3
    });

    const stderr = await runCapturingStderr([
      "role",
      "update-job-type",
      JOB_TYPE_ID,
      "--body",
      "{}"
    ]);

    // Positive control first: without it, a warning that never fired would
    // satisfy the negative assertion below and prove nothing at all.
    expect(stderr, "the reprice warning did not fire").toContain("REPRICED");
    expect(stderr, "the warning sends the caller to a figure this write cannot move").not.toMatch(
      /coverage/i
    );
  });
});

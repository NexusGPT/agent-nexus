import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HELP_SCOPE_HEADING } from "./help-scope";
import { buildRootProgram } from "./root-program";
import { asDerivedCapture } from "./util/version-check";

/**
 * EVERY HELP SCREEN SAYS WHICH CLIENT IS TALKING.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT WENT WRONG
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * An audit of the Roles product recorded capabilities as absent from the
 * PLATFORM on the evidence that no verb for them existed in the CLI. Eleven
 * rows carried the note *"none — `nexus role tasks` is read-only"*, which is a
 * near-quote of what `nexus role tasks --help` printed in 0.22.1: `READ-ONLY
 * TODAY. There is no "set-tasks"`. Every word of that was TRUE for that build —
 * 0.22.1's bundle carries no `command("set-tasks")` and no `replaceTasks` call
 * (controls: `command("add-member")` twice, `command("tasks")` once, a
 * fabricated verb zero). 0.23.0, published four hours before the audit, has
 * both.
 *
 * So the reader was not careless and the help text was not wrong. The screen
 * was missing the two facts that make an absence readable: WHICH VERSION is
 * speaking, and that a client's verb table is smaller than the platform's route
 * table at every version.
 *
 * ── WHY THIS SWEEPS INSTEAD OF LISTING ───────────────────────────────────────
 *
 * The population is walked off the real command tree, so a namespace or a
 * subcommand added tomorrow is covered without being named here. A
 * hand-enumerated list is what the fix REPLACED: one `Notes:` line naming a
 * writer existed, on one command, and a derivation over the same tree found ten
 * more read verbs whose writers their own help never names. A list cannot see
 * the case nobody declared.
 *
 * The floors below are asserted so an empty or collapsed walk FAILS. A sweep
 * that silently found nothing to check is the shape this whole file exists to
 * refuse.
 *
 * ── WHY `buildRootProgram` AND NOT A REBUILT PROGRAM ─────────────────────────
 *
 * A program a test assembles itself agrees with itself. This imports the same
 * builder the shipped binary calls, so removing the footer from the binary is
 * what reddens this file. Mutation-proved — see the commit message.
 *
 * The version is INJECTED rather than read from `package.json`, because the
 * footer prints it: asserting against the real `VERSION` would compare the
 * builder to itself and pass whatever either side said.
 */

/**
 * The bytes a caller reads from `--help`.
 *
 * `outputHelp()`, never `helpInformation()`: only the former runs the
 * `addHelpText` handlers, and the footer IS one. A probe built on
 * `helpInformation()` passes against a program that never registered it.
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

/** Every command in the tree, at every depth, root included. */
function walk(command: Command): Command[] {
  return [command, ...command.commands.flatMap((child) => walk(child))];
}

const VERSION = "1.2.3";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Point the version cache at an empty directory, so the staleness line is
 * decided by this file and never by whatever the machine running the suite
 * happens to have on disk.
 */
function withCache(latestVersion: string | null): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-help-scope-"));
  if (latestVersion !== null) {
    fs.mkdirSync(path.join(dir, ".nexus-mcp"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".nexus-mcp", "version-check.json"),
      JSON.stringify({ lastChecked: Date.now(), latestVersion })
    );
  }
  vi.spyOn(os, "homedir").mockReturnValue(dir);
}

describe("every help screen names the client that is talking", () => {
  it("carries the scope footer on every command at every depth", () => {
    withCache(null);
    const program = buildRootProgram(VERSION);
    const all = walk(program);

    // The walk is the population. Assert it is real before believing a pass.
    expect(all.length).toBeGreaterThan(300);
    expect(program.commands.length).toBeGreaterThan(40);
    const depthTwo = program.commands.flatMap((c) => c.commands);
    expect(depthTwo.length).toBeGreaterThan(200);

    const missing = all
      .filter((cmd) => !helpText(cmd).includes(HELP_SCOPE_HEADING))
      .map((cmd) => cmd.name());

    expect(missing).toEqual([]);
  });

  it("names the running version, so a quoted absence claim dates itself", () => {
    withCache(null);
    const tasks = subcommand(buildRootProgram(VERSION), "role", "tasks");

    expect(helpText(tasks)).toContain(`@agent-nexus/cli ${VERSION}`);
  });

  it("names NO version in a derived capture, so the same tree projects the same page", () => {
    // 🚨 THIS IS THE GATE ON A DEFECT NO CLI CHANGE CAN CAUSE AND NO
    // REGENERATION CAN CURE. `packages/cli/package.json`'s `version` is written
    // by the changesets release, which lands on `main` and never on `staging`.
    // A staging->main promotion is tested on `refs/pull/<n>/merge` — main's
    // package.json beside staging's committed pages — so while the footer named
    // the version, EVERY generated page differed from its projection on a tree
    // where nobody had touched a CLI file. Measured on PR #3638: main at
    // 0.25.0, staging at 0.21.9, all 45 pages reported stale, and the same
    // pages were green on staging alone. The next release re-opens it, so the
    // property below is what has to hold, not the pages being fresh today.
    withCache(null);
    const derived = (version: string): string =>
      asDerivedCapture(() => helpText(subcommand(buildRootProgram(version), "role", "tasks")));
    const live = (version: string): string =>
      helpText(subcommand(buildRootProgram(version), "role", "tasks"));

    // Anti-vacuity: a footer that never named the version would satisfy the
    // equality below while proving nothing. The live render is the control, and
    // it is the surface that legitimately still dates itself.
    expect(live("0.21.9")).not.toEqual(live("0.25.0"));

    expect(derived("0.21.9")).toEqual(derived("0.25.0"));
    expect(derived(VERSION)).toContain(HELP_SCOPE_HEADING);
    expect(derived(VERSION)).not.toContain(VERSION);
  });

  it("puts the footer BELOW the command's own Notes block", () => {
    // Position is the whole point: a caveat above the claim it qualifies is
    // read first and overridden by what follows it. `role tasks` is the command
    // the audit actually read, and its Notes block is where an absence claim
    // lives.
    withCache(null);
    const rendered = helpText(subcommand(buildRootProgram(VERSION), "role", "tasks"));

    const notes = rendered.indexOf("Notes:");
    const footer = rendered.indexOf(HELP_SCOPE_HEADING);
    expect(notes).toBeGreaterThan(-1);
    expect(footer).toBeGreaterThan(notes);
  });

  it("tells a stale client it is stale, on the help surface itself", () => {
    // The defect in one assertion. `checkForUpdate` runs in
    // `parseAsync().then()`, and commander's help action exits before that
    // promise settles — so before this footer existed, the ONE surface a reader
    // consults to decide whether a verb exists was the one surface that never
    // said the verb table was stale.
    withCache("9.9.9");
    const rendered = helpText(subcommand(buildRootProgram(VERSION), "role", "tasks"));

    expect(rendered).toContain(`Update available: ${VERSION} → 9.9.9`);
  });

  it("says nothing about updates when the cache knows of nothing newer", () => {
    withCache("0.0.1");

    expect(helpText(subcommand(buildRootProgram(VERSION), "role", "tasks"))).not.toContain(
      "Update available"
    );
  });

  it("says nothing about updates when no check has ever run", () => {
    withCache(null);

    expect(helpText(subcommand(buildRootProgram(VERSION), "role", "tasks"))).not.toContain(
      "Update available"
    );
  });

  it("says the fallback it offers cannot reach the routes it just named", () => {
    // The footer's own hole. It names routes the dashboard calls and no verb
    // here covers, then offers `nexus api` as the way to disprove an absence —
    // and `HttpClient` prepends `/api/public/v1` to every path with no flag that
    // removes it, so those are exactly the routes the probe cannot address. A
    // reader who ran it, got nothing and recorded the capability as missing
    // followed this block correctly and still reached the wrong answer.
    withCache(null);
    const rendered = helpText(subcommand(buildRootProgram(VERSION), "role", "tasks"));

    expect(rendered).toContain("reaches public/v1 and NOTHING ELSE");
    expect(rendered).toContain("not a capability that is absent");
  });
});

describe("nexus api says which surface it can and cannot reach", () => {
  it("names the prefix, and that a silent probe is not an absent capability", () => {
    withCache(null);
    const program = buildRootProgram(VERSION);
    const api = program.commands.find((cmd) => cmd.name() === "api");
    if (!api) throw new Error('no "api" command');
    const rendered = helpText(api);

    // The path is not "relative to public/v1" as a convention a caller can opt
    // out of: the prefix is prepended in the SDK's `HttpClient` and no flag
    // removes it. So this command is structurally unable to audit the platform,
    // and the audit that concluded five Role capabilities were missing was built
    // on it.
    expect(rendered).toContain("{base-url}/api/public/v1{path}");
    expect(rendered).toContain("CANNOT AUDIT THE PLATFORM");
    expect(rendered).toContain("blind to that family by");
  });
});

/** Resolve `nexus <noun> <sub>`, refusing rather than returning undefined. */
function subcommand(program: Command, noun: string, sub: string): Command {
  const group = program.commands.find((cmd) => cmd.name() === noun);
  if (!group) throw new Error(`no "${noun}" command`);
  const child = group.commands.find((cmd) => cmd.name() === sub);
  if (!child) throw new Error(`no "${noun} ${sub}" command`);
  return child;
}

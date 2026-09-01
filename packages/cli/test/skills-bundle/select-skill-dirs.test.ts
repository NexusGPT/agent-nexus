import { describe, expect, it } from "vitest";

import {
  BUNDLED_SKILL_PREFIX,
  classifySkillsRoot,
  formatSkillDirReport,
  NON_SKILL_DIRS,
  type SelectionIo,
  selectSkillDirs,
  SHARED_DIR,
  type SkillsRootEntry
} from "../../scripts/skills-bundle/select-skill-dirs";

/**
 * The generator's directory selection, and the report that is the whole point
 * of it.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE IS IN `test/` AND NOT BESIDE THE MODULE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `vitest.config.ts` collects `src/**\/*.test.ts` and `test/**\/*.test.ts` and
 * nothing else, so a spec written next to the module under `scripts/` would be
 * collected by NOTHING and would report on nothing — the same defect one level
 * out, and one this package has already been bitten by
 * (`test/id-thread/id-thread-sweep.test.ts` documents the incident).
 * `scripts/typecheck-guards.ts` reads that same include list and reports any
 * test file no glob reaches, which is what stops it happening again.
 *
 * ── THE TWO REAL TREES ──────────────────────────────────────────────────────
 *
 * The firing case and the quiet case below are not invented. They are the
 * literal `skills/` listings of the upstream repository at the two shas that
 * bracket the defect, read from the GitHub contents API:
 *
 *   d28e9180e301d351608b3e2bc87d667a23db39fd  21 entries, nothing skipped
 *   bc52b93c42b6d9cda80746e5ef43856984d96c57  24 entries, `plain` skipped
 *
 * So "quiet" is a tree that really was quiet, rather than a shape constructed
 * to make the quiet branch run.
 */

const dir = (name: string): SkillsRootEntry => ({ name, isDirectory: () => true });
const file = (name: string): SkillsRootEntry => ({ name, isDirectory: () => false });

/** Upstream `skills/` at d28e9180 — 20 nexus-* skills plus `shared`. */
const UPSTREAM_D28E9180 = [
  "nexus-agent-management",
  "nexus-analytics",
  "nexus-app-builder",
  "nexus-cloud-imports",
  "nexus-deployments",
  "nexus-emulator",
  "nexus-evaluations",
  "nexus-getting-started",
  "nexus-inbox-management",
  "nexus-knowledge-base",
  "nexus-prompt-assistant",
  "nexus-skills-and-tasks",
  "nexus-tickets",
  "nexus-tool-connection",
  "nexus-tool-execute",
  "nexus-tracing",
  "nexus-tracks",
  "nexus-workflow-builder",
  "nexus-workflow-executions",
  "nexus-workspaces",
  "shared"
].map(dir);

/** Upstream `skills/` at bc52b93 — the same tree plus `nexus-chat`, `nexus-prompt-lifecycle`, `plain`. */
const UPSTREAM_BC52B93 = [
  "nexus-agent-management",
  "nexus-analytics",
  "nexus-app-builder",
  "nexus-chat",
  "nexus-cloud-imports",
  "nexus-deployments",
  "nexus-emulator",
  "nexus-evaluations",
  "nexus-getting-started",
  "nexus-inbox-management",
  "nexus-knowledge-base",
  "nexus-prompt-assistant",
  "nexus-prompt-lifecycle",
  "nexus-skills-and-tasks",
  "nexus-tickets",
  "nexus-tool-connection",
  "nexus-tool-execute",
  "nexus-tracing",
  "nexus-tracks",
  "nexus-workflow-builder",
  "nexus-workflow-executions",
  "nexus-workspaces",
  "plain",
  "shared"
].map(dir);

function recordingIo(): SelectionIo & { logs: string[]; warns: string[] } {
  const logs: string[] = [];
  const warns: string[] = [];
  return {
    logs,
    warns,
    log: (m) => logs.push(m),
    warn: (m) => warns.push(m)
  };
}

describe("classifySkillsRoot", () => {
  it("names `plain` as skipped on the real upstream tree that gained it", () => {
    const selection = classifySkillsRoot(UPSTREAM_BC52B93);

    // The names, not a count. A count is what `Found N skill directories`
    // already was, and it is what could not report this.
    expect(selection.skipped).toEqual(["plain"]);
    expect(selection.consumedElsewhere).toEqual([SHARED_DIR]);
    expect(selection.missingDeclared).toEqual([]);
    expect(selection.bundled).toHaveLength(22);
    expect(selection.bundled).not.toContain("plain");
    expect(selection.bundled).not.toContain(SHARED_DIR);
  });

  it("skips nothing on the real upstream tree from before `plain` existed", () => {
    const selection = classifySkillsRoot(UPSTREAM_D28E9180);

    expect(selection.skipped).toEqual([]);
    expect(selection.consumedElsewhere).toEqual([SHARED_DIR]);
    expect(selection.missingDeclared).toEqual([]);
    expect(selection.bundled).toHaveLength(20);
  });

  it("reports a declared directory that has gone missing upstream", () => {
    // `collectFiles()` returns [] for a directory that is not there, so a
    // renamed `shared/` upstream would empty SHARED_FILES with no error. This
    // is the same silent hole one door over, and the declaration catches it.
    const selection = classifySkillsRoot([dir("nexus-analytics")]);

    expect(selection.missingDeclared).toEqual([SHARED_DIR]);
    expect(selection.consumedElsewhere).toEqual([]);
  });

  it("never bundles a non-directory entry, and still names it", () => {
    const selection = classifySkillsRoot([dir("nexus-analytics"), file("README.md"), dir("plain")]);

    expect(selection.bundled).toEqual(["nexus-analytics"]);
    expect(selection.nonDirectories).toEqual(["README.md"]);
    expect(selection.skipped).toEqual(["plain"]);
  });

  it("accounts for every entry handed in — nothing falls off the end", () => {
    const names = [...UPSTREAM_BC52B93.map((e) => e.name), "README.md"];
    const selection = classifySkillsRoot([...UPSTREAM_BC52B93, file("README.md")]);

    const accounted = [
      ...selection.bundled,
      ...selection.consumedElsewhere,
      ...selection.skipped,
      ...selection.nonDirectories
    ].sort();

    expect(accounted).toEqual([...names].sort());
  });

  it("sorts every bucket, so the report is stable across readdir order", () => {
    const selection = classifySkillsRoot([
      dir("nexus-z"),
      dir("nexus-a"),
      dir("zeta"),
      dir("beta")
    ]);

    expect(selection.bundled).toEqual(["nexus-a", "nexus-z"]);
    expect(selection.skipped).toEqual(["beta", "zeta"]);
  });
});

describe("formatSkillDirReport", () => {
  it("puts the skipped names on the WARN channel, with the name in the text", () => {
    const report = formatSkillDirReport(classifySkillsRoot(UPSTREAM_BC52B93));

    expect(report.warn).toHaveLength(1);
    expect(report.warn[0]).toContain("skills/plain/");
    expect(report.warn[0]).toContain("SKIPPED 1 top-level directory");
    // The quiet line must NOT also be present — two contradictory verdicts in
    // one run is how a reader learns to skim past both.
    expect(report.log.some((line) => line.includes("SKIPPED NOTHING"))).toBe(false);
  });

  it("still says so when there is nothing to say", () => {
    // "Nothing was skipped" and "the skip reporting broke" must not be the same
    // output. This is the assertion that makes the empty case falsifiable.
    const report = formatSkillDirReport(classifySkillsRoot(UPSTREAM_D28E9180));

    expect(report.warn).toEqual([]);
    expect(report.log.filter((line) => line.includes("SKIPPED NOTHING"))).toHaveLength(1);
  });

  it("names the consumed-elsewhere directory and its reason, never just a count", () => {
    const report = formatSkillDirReport(classifySkillsRoot(UPSTREAM_BC52B93));
    const line = report.log.find((l) => l.includes("consumed elsewhere"));

    expect(line).toBeDefined();
    expect(line).toContain(`skills/${SHARED_DIR}/`);
    expect(line).toContain(NON_SKILL_DIRS[SHARED_DIR]);
  });

  it("warns separately when a declared directory is absent upstream", () => {
    const report = formatSkillDirReport(classifySkillsRoot([dir("nexus-analytics")]));

    expect(report.warn).toHaveLength(1);
    expect(report.warn[0]).toContain("DECLARED BUT ABSENT");
    expect(report.warn[0]).toContain(`skills/${SHARED_DIR}/`);
  });

  it("emits one line per category even when every category is empty", () => {
    const report = formatSkillDirReport({
      bundled: [],
      consumedElsewhere: [],
      missingDeclared: [],
      skipped: [],
      nonDirectories: []
    });

    expect(report.log.filter((l) => l.includes("consumed elsewhere: none"))).toHaveLength(1);
    expect(report.log.filter((l) => l.includes("non-directory entries"))).toHaveLength(1);
    expect(report.log.filter((l) => l.includes("SKIPPED NOTHING"))).toHaveLength(1);
  });
});

describe("selectSkillDirs", () => {
  it("cannot return the bundled list without emitting the report", () => {
    // The structural claim: reporting is inside the selector, so there is no
    // call site that can obtain `skillDirs` and skip the warning. Delete the
    // emit and this reds.
    const io = recordingIo();
    const bundled = selectSkillDirs(UPSTREAM_BC52B93, io);

    expect(bundled).toHaveLength(22);
    expect(io.warns).toHaveLength(1);
    expect(io.warns[0]).toContain("skills/plain/");
    expect(io.logs.length).toBeGreaterThan(0);
  });

  it("writes the quiet verdict to the log channel and warns about nothing", () => {
    const io = recordingIo();
    const bundled = selectSkillDirs(UPSTREAM_D28E9180, io);

    expect(bundled).toHaveLength(20);
    expect(io.warns).toEqual([]);
    expect(io.logs.filter((l) => l.includes("SKIPPED NOTHING"))).toHaveLength(1);
  });

  it("returns exactly the prefixed directories, in sorted order", () => {
    const io = recordingIo();

    expect(selectSkillDirs(UPSTREAM_BC52B93, io)).toEqual(
      UPSTREAM_BC52B93.map((e) => e.name)
        .filter((n) => n.startsWith(BUNDLED_SKILL_PREFIX))
        .sort()
    );
  });
});

/**
 * The release pin gate, driven against the states that actually shipped and the
 * one that was actually withheld.
 *
 * ## Why this spec is in `test/` and not beside its siblings in `src/`
 *
 * `tsconfig.json` compiles `src` with `rootDir: src`, so anything under `src/`
 * that imports `scripts/` fails the build typecheck with TS6059 — and it fails
 * for the whole package, not just for the spec. `tsconfig.test.json` is the one
 * that spans `src`, `test` and `scripts`, and `vitest.config.ts` includes both
 * trees in one runner. So a spec covering a `scripts/` module belongs here.
 *
 * ## Why the fixtures are recorded rather than invented
 *
 * Every payload is GitHub's own answer — 1.3.0 as it shipped, 1.10.0 as mirror
 * sync run 37428682363 withheld it, and #7344's refresh. `fixtures/publish-pin/
 * recorded.ts` names each one and the command that re-derives it.
 *
 * A gate proven only against an input its author wrote is proven against that
 * author's model of the defect. These are the defect, and the race.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkPublishPin,
  gateOutputs,
  PUBLISH_PIN_EXIT_CODE
} from "../../scripts/skills-drift/publish-pin";
import {
  A1CEF_FULL,
  DEADLINE_1_3_0,
  DEADLINE_1_10_0,
  deadlineAt,
  DUE_1_3_0,
  DUE_1_10_0,
  GAP_1_3_0,
  GAP_7344,
  HEAD_AT_1_3_0,
  HEAD_AT_7344,
  PIN_1_3_0,
  PIN_1_10_0,
  PIN_7344,
  readerFor,
  REPO_ROOT,
  ROUTES_1_3_0,
  ROUTES_1_10_0,
  ROUTES_7344,
  W69_FIX
} from "./fixtures/publish-pin/recorded";

// ── the defect ───────────────────────────────────────────────────────────────

describe("1.3.0 is still refused — the guarantee the gate exists for", () => {
  it("the deadline 1.3.0 had is merge − tolerance, after the fix landed", () => {
    expect(DEADLINE_1_3_0.at).toBe("2026-09-05T05:16:18.000Z");
  });

  it("REFUSES the pin @agent-nexus/cli@1.3.0 actually published", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
    expect(verdict.code).toBe("PIN_BEHIND_DEADLINE");
    expect(PUBLISH_PIN_EXIT_CODE[verdict.state]).toBe(1);
  });

  it("names every commit that was due, as a set of shas", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.missing.map((c) => c.sha)).toEqual(GAP_1_3_0.commits.map((c) => c.sha));
    expect(verdict.notYetDue).toEqual([]);
  });

  it("carries the enforcement fix and its PR number", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.missing.map((c) => c.sha)).toContain(W69_FIX);
    expect(verdict.missing.map((c) => c.pr)).toContain(45);
  });

  it("names the shipping files, and only those", async () => {
    // 1.10.0's range, not 1.3.0's: every 1.3.0 file ships, so a renderer that
    // listed every path would pass there. This range also carries `tools/` and
    // two dot-segment `.claude-plugin/` files, which no install writes.
    const verdict = await checkPublishPin({
      pin: PIN_1_10_0,
      read: readerFor(ROUTES_1_10_0),
      deadline: DEADLINE_1_10_0
    });
    const listed = verdict.detail.filter((l) => /^ {2}\S+$/.test(l)).map((l) => l.trim());
    expect(listed).toContain("settings.json");
    expect(listed).not.toContain("tools/quietswitch_e2e.py");
    expect(listed).not.toContain("skills/cue-checks/.claude-plugin/plugin.json");
    expect(listed).toHaveLength(13);
  });

  it("prints a remedy that ADVANCES the pin — the lock goes before the generator runs", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: DEADLINE_1_3_0
    });
    const remedy = verdict.detail.find((line) => line.includes("run gen:skills")) ?? "";
    const removal = remedy.indexOf("rm packages/cli/skills-nexus.lock");
    expect(removal).toBeGreaterThanOrEqual(0);
    expect(removal).toBeLessThan(remedy.indexOf("run gen:skills"));
  });
});

// ── the race ─────────────────────────────────────────────────────────────────

describe("the race is gone: the deadline is fixed once the release merged", () => {
  it("1.10.0's own pin is still refused — the 29 commits landed before its deadline", async () => {
    // Not a pass: this release DID sit 29 hours between its cut and its merge
    // while upstream moved. What changes is that a refresh can now satisfy it.
    const verdict = await checkPublishPin({
      pin: PIN_1_10_0,
      read: readerFor(ROUTES_1_10_0),
      deadline: DEADLINE_1_10_0
    });
    expect(DEADLINE_1_10_0.at).toBe("2026-10-06T01:16:48.000Z");
    expect(verdict.code).toBe("PIN_BEHIND_DEADLINE");
    expect(verdict.missing).toHaveLength(29);
  });

  it("#7344's refresh PASSES the same deadline while being four commits behind head", async () => {
    // THE ARM THE OLD GATE COULD NEVER SATISFY. Head moved four commits past the
    // refresh within minutes; all four landed after 1.10.0's deadline.
    const verdict = await checkPublishPin({
      pin: PIN_7344,
      read: readerFor(ROUTES_7344),
      deadline: DEADLINE_1_10_0
    });
    expect(verdict.state).toBe("RELEASE_PIN_CURRENT");
    expect(verdict.code).toBe("PIN_CURRENT_AT_DEADLINE");
    expect(verdict.missing).toEqual([]);
    expect(verdict.notYetDue.map((c) => c.sha)).toEqual(GAP_7344.commits.map((c) => c.sha));
  });

  it("…and those four are printed as due in the next release, not dropped", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_7344,
      read: readerFor(ROUTES_7344),
      deadline: DEADLINE_1_10_0
    });
    const detail = verdict.detail.join("\n");
    for (const c of GAP_7344.commits) expect(detail).toContain(c.sha.slice(0, 10));
    expect(detail).toContain("NOT in this release");
  });

  it("the same refresh with NO release deadline is refused — content at head is the strict reading", async () => {
    // The control on the arm above: what passed it was the deadline, not a
    // permissive reader. Those four commits do change shipping files.
    const verdict = await checkPublishPin({
      pin: PIN_7344,
      read: readerFor(ROUTES_7344),
      deadline: null
    });
    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
    expect(verdict.code).toBe("PIN_BEHIND_DEADLINE");
  });
});

// ── landing, not writing ─────────────────────────────────────────────────────

describe("a commit counts from when it LANDED on main, not when it was written", () => {
  it("passes a deadline between the W69 fix being written and its merge landing", async () => {
    // 3edc3d3da9 was committed 09:52 on a branch; #45 merged it at 15:55:54.
    // At 15:00 it had not landed. A gate reading commit dates would refuse here.
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: deadlineAt("2026-09-04T15:00:00Z")
    });
    expect(verdict.code).toBe("PIN_CURRENT_AT_DEADLINE");
    expect(verdict.notYetDue.map((c) => c.sha)).toContain(W69_FIX);
  });

  it("refuses one minute after #45 landed, and holds only what had landed by then", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: deadlineAt("2026-09-04T15:56:54Z")
    });
    expect(verdict.code).toBe("PIN_BEHIND_DEADLINE");
    expect(verdict.missing.map((c) => c.sha)).toEqual(DUE_1_3_0.commits.map((c) => c.sha));
    // The two merges after 15:56 are not held against it.
    expect(verdict.notYetDue).toHaveLength(GAP_1_3_0.commits.length - DUE_1_3_0.commits.length);
  });
});

// ── content, not shas ────────────────────────────────────────────────────────

describe("a commit that ships nothing never makes a bundle stale", () => {
  const NON_SHIPPING = {
    ...GAP_7344,
    files: GAP_7344.files.filter((f) => f.filename.startsWith("statusline"))
  };

  it("passes a pin behind head whose missing commits touch only statusline/", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_7344,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_7344 },
        [`/compare/${PIN_7344}...${HEAD_AT_7344}`]: NON_SHIPPING
      }),
      deadline: null
    });
    // CONTROL on the filter itself: the decoy list is non-empty, so this pass is
    // about the paths and not about an empty list.
    expect(NON_SHIPPING.files.length).toBeGreaterThan(0);
    expect(verdict.state).toBe("RELEASE_PIN_CURRENT");
    expect(verdict.code).toBe("PIN_CONTENT_IS_HEAD");
  });

  it("refuses the same range once one shipping file is in it", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_7344,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_7344 },
        [`/compare/${PIN_7344}...${HEAD_AT_7344}`]: {
          ...NON_SHIPPING,
          files: [...NON_SHIPPING.files, { filename: "settings.json", status: "modified" }]
        }
      }),
      deadline: null
    });
    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
  });

  it("a rename OUT of a shipping root still counts — the bundle loses that file", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_7344,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_7344 },
        [`/compare/${PIN_7344}...${HEAD_AT_7344}`]: {
          ...NON_SHIPPING,
          files: [
            {
              filename: "statusline/moved.py",
              previous_filename: "hooks/moved.py",
              status: "renamed"
            }
          ]
        }
      }),
      deadline: null
    });
    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
  });

  it("judges the deadline commit by ITS content, not head's", async () => {
    // 1.10.0 at a deadline of 21:00: a1cef4e993 is the newest commit landed by
    // then. Recorded, its range changes settings.json — refused. With only
    // `tools/` in that range it would pass while head's range still ships.
    const deadline = deadlineAt("2026-10-05T21:00:00Z");
    const routes = { ...ROUTES_1_10_0, [`/compare/${PIN_1_10_0}...${A1CEF_FULL}`]: DUE_1_10_0 };

    const recorded = await checkPublishPin({ pin: PIN_1_10_0, read: readerFor(routes), deadline });
    expect(recorded.code).toBe("PIN_BEHIND_DEADLINE");
    expect(recorded.missing.map((c) => c.sha)).toEqual(DUE_1_10_0.commits.map((c) => c.sha));

    const toolsOnly = await checkPublishPin({
      pin: PIN_1_10_0,
      read: readerFor({
        ...routes,
        [`/compare/${PIN_1_10_0}...${A1CEF_FULL}`]: {
          ...DUE_1_10_0,
          files: [{ filename: "tools/quietswitch_e2e.py", status: "added" }]
        }
      }),
      deadline
    });
    expect(toolsOnly.state).toBe("RELEASE_PIN_CURRENT");
    expect(toolsOnly.code).toBe("PIN_CONTENT_CURRENT_AT_DEADLINE");
  });
});

// ── the controls that must stay green ───────────────────────────────────────

describe("the controls that must stay green", () => {
  it("passes when the pin IS the branch head", async () => {
    const verdict = await checkPublishPin({
      pin: HEAD_AT_1_3_0,
      read: readerFor({ "/commits/main": { sha: HEAD_AT_1_3_0 } }),
      deadline: null
    });
    expect(verdict.state).toBe("RELEASE_PIN_CURRENT");
    expect(PUBLISH_PIN_EXIT_CODE[verdict.state]).toBe(0);
  });

  it("compares case-insensitively, so an upper-case sha is not a false refusal", async () => {
    const verdict = await checkPublishPin({
      pin: HEAD_AT_1_3_0.toUpperCase(),
      read: readerFor({ "/commits/main": { sha: HEAD_AT_1_3_0 } }),
      deadline: null
    });
    expect(verdict.state).toBe("RELEASE_PIN_CURRENT");
  });

  it("never runs at all on a sync that carries no CLI release tag, and judges a release when it does", () => {
    // AND THIS ARM READS TEXT, NOT BEHAVIOUR — it catches the guard or the flag
    // being deleted, and cannot catch either being present and wrong.
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, ".github", "workflows", "mirror-public-packages.yml"),
      "utf-8"
    );
    expect(workflow).toContain("grep -q '^cli-v' \"${GITHUB_WORKSPACE}/tags-to-push.txt\"");
    expect(workflow).toContain('check-publish-pin.ts" --release-ref "${GITHUB_SHA}"');
    expect(workflow).toContain("NEXUS_REPO_READ_TOKEN: ${{ github.token }}");
  });
});

describe("a gate that cannot measure must not report success", () => {
  it("refuses with NO_TOKEN when there is no credential", async () => {
    const verdict = await checkPublishPin({ pin: PIN_1_3_0, read: null, deadline: DEADLINE_1_3_0 });
    expect(verdict.state).toBe("RELEASE_PIN_UNCHECKED");
    expect(verdict.code).toBe("NO_TOKEN");
    expect(PUBLISH_PIN_EXIT_CODE[verdict.state]).toBe(2);
  });

  it("refuses when the branch head cannot be read", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: () => Promise.resolve({ kind: "transport", message: "socket hang up" }),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.code).toBe("HEAD_UNREADABLE");
  });

  it("refuses when the pin is not an object upstream holds", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: (apiPath) =>
        Promise.resolve(
          apiPath === "/commits/main"
            ? { kind: "ok", body: { sha: HEAD_AT_1_3_0 } }
            : { kind: "http", status: 404, statusText: "Not Found" }
        ),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.code).toBe("PIN_NOT_IN_UPSTREAM");
  });

  it("refuses when two different shas compare to no commits at all", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_1_3_0 },
        [`/compare/${PIN_1_3_0}...${HEAD_AT_1_3_0}`]: { ...GAP_1_3_0, commits: [] }
      }),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.code).toBe("COMPARE_EMPTY");
  });

  it("refuses rather than reading a truncated file list as complete", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_1_3_0 },
        [`/compare/${PIN_1_3_0}...${HEAD_AT_1_3_0}`]: {
          ...GAP_1_3_0,
          files: Array.from({ length: 300 }, (_, i) => ({ filename: `tools/f${i}.py` }))
        }
      }),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.state).toBe("RELEASE_PIN_UNCHECKED");
    expect(verdict.code).toBe("FILES_TRUNCATED");
  });

  it("refuses rather than walking a truncated commit list", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_1_3_0 },
        [`/compare/${PIN_1_3_0}...${HEAD_AT_1_3_0}`]: { ...GAP_1_3_0, total_commits: 300 }
      }),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.code).toBe("RANGE_TRUNCATED");
  });

  it("refuses a deadline that is not a date", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor(ROUTES_1_3_0),
      deadline: deadlineAt("not a date")
    });
    expect(verdict.code).toBe("DEADLINE_UNREADABLE");
  });
});

describe("a pin off the branch is a different refusal from a pin behind it", () => {
  it("reports PIN_DIVERGED, because refreshing the pin is not the remedy", async () => {
    const verdict = await checkPublishPin({
      pin: PIN_1_3_0,
      read: readerFor({
        "/commits/main": { sha: HEAD_AT_1_3_0 },
        [`/compare/${PIN_1_3_0}...${HEAD_AT_1_3_0}`]: {
          ...GAP_1_3_0,
          status: "diverged",
          behind_by: 2
        }
      }),
      deadline: DEADLINE_1_3_0
    });
    expect(verdict.state).toBe("RELEASE_PIN_BEHIND");
    expect(verdict.code).toBe("PIN_DIVERGED");
    expect(verdict.missing).toHaveLength(GAP_1_3_0.commits.length);
  });
});

describe("the verdict the workflow reads, one arm per state", () => {
  it("a current pin ships and withholds nothing", () => {
    expect(gateOutputs("RELEASE_PIN_CURRENT")).toEqual({ verdict: "current", withhold: false });
  });

  it("a pin behind upstream is a deliberate refusal, and withholds", () => {
    expect(gateOutputs("RELEASE_PIN_BEHIND")).toEqual({ verdict: "behind", withhold: true });
  });

  it("UNCHECKED withholds and is NOT a refusal, so a tooling failure still pages", () => {
    expect(gateOutputs("RELEASE_PIN_UNCHECKED")).toEqual({ verdict: "unchecked", withhold: true });
  });

  it("only `current` and `not-applicable` may publish, and the workflow tests that negatively", () => {
    const workflow = fs.readFileSync(
      path.join(REPO_ROOT, ".github", "workflows", "mirror-public-packages.yml"),
      "utf-8"
    );
    expect(workflow).toContain("steps.publish_pin.outputs.verdict != 'current'");
    expect(workflow).toContain("steps.publish_pin.outputs.verdict != 'not-applicable'");
    expect(workflow).toContain("publish_pin_verdict: ${{ steps.publish_pin.outputs.verdict }}");
    expect(workflow).toContain(
      "release_withheld: ${{ steps.withhold_decl.outputs.release_withheld }}"
    );
    expect(workflow).toContain("id: withhold_decl");
  });
});

/**
 * Every cleanup delete in the E2E flows goes through ONE helper, and that helper
 * both supplies `--yes` and records a failure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS REPLACES
 *
 * PR #3664 (2026-08-15) made a destructive CLI command REFUSE without `--yes`
 * when stdin is not a terminal. Ten cleanup deletes across the three flow
 * scripts each had to remember the flag. Every one of them became a no-op the
 * same day, and each "failure" returned in about 160ms having sent no HTTP
 * request at all.
 *
 * Nothing went red, because a cleanup failure only ever printed a line to
 * stderr. Five days and 486 workflow runs later the shared staging org held 4363
 * orphan `nexus_e2e_*` rows — 1635 agents, 1090 deployments, 554 collections,
 * 553 documents, 539 workflows. 1616 of the agents were created after #3664.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE IS A GATE AND NOT A COMMENT
 *
 * The obvious repair was to add the flag back at all ten sites. That restores
 * the behaviour and leaves the DEFECT CLASS untouched: the eleventh delete
 * somebody writes next month has to remember a flag, and the failure mode is
 * silent, delayed by days, and looks exactly like everything working.
 *
 * So the flag moved INTO the helper — a call site cannot forget what it does not
 * write — and this file refuses a call site that goes around it. Four files
 * (`lib.sh`, both flow headers, `test/e2e/README.md`) already described a reaper
 * that would clean up after exactly this, and no such job had ever been written;
 * prose is measured not to fire. A test does.
 */
import * as fs from "fs";
import * as path from "path";

import { describe, expect, it } from "vitest";

const E2E_DIR = path.resolve(__dirname, "..", "e2e");
const LIB = path.join(E2E_DIR, "lib.sh");

const FLOWS = fs
  .readdirSync(E2E_DIR)
  .filter((f) => /^\d+-.*\.sh$/.test(f))
  .sort();

const read = (file: string): string => fs.readFileSync(file, "utf8");

/** Shell comments are prose. A gate satisfied by prose stays green through a revert. */
const code = (source: string): string =>
  source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

describe("the E2E flow scripts exist and are discoverable", () => {
  it("finds the three flows — an empty population would pass every test below", () => {
    // Without this, a rename of the flow files empties FLOWS and the whole file
    // reports green over nothing. That is the same class of hole it is written
    // to close, one level up.
    expect(FLOWS.length).toBeGreaterThanOrEqual(3);
    expect(FLOWS).toContain("01-hello-agent.sh");
    expect(FLOWS).toContain("02-workflow-attach.sh");
    expect(FLOWS).toContain("03-knowledge-attach.sh");
  });
});

describe("no cleanup delete bypasses the accounted helper", () => {
  for (const flow of FLOWS) {
    it(`${flow} calls no delete directly`, () => {
      const body = code(read(path.join(E2E_DIR, flow)));
      // `nx <anything> delete …` in command position. The helper is invoked as
      // `cleanup_delete …` and never matches this, so a hit is a bypass.
      const direct = body
        .split("\n")
        .filter((l) => /(^|\s|!)nx\s+[a-z-]+(\s+[a-z-]+)?\s+delete\b/.test(l));
      expect(
        direct,
        `${flow} calls \`nx … delete\` directly. Use cleanup_delete — it supplies ` +
          `--yes and records the failure, so a leak cannot pass silently.`
      ).toEqual([]);
    });

    it(`${flow} exits through cleanup_verdict`, () => {
      const body = code(read(path.join(E2E_DIR, flow)));
      // A flow that exits on its own `rc` cannot report a leak, which is the
      // exact state the suite was in for five days.
      expect(body).toContain("cleanup_verdict");
      expect(body).not.toMatch(/^\s*exit "\$\{rc\}"\s*$/m);
    });
  }
});

describe("the helper supplies what the call sites no longer have to remember", () => {
  const lib = code(read(LIB));

  it("cleanup_delete passes --yes", () => {
    // #3664: a destructive command refuses without it when stdin is not a tty.
    const fn = /cleanup_delete\(\)\s*\{[\s\S]*?\n\}/.exec(lib);
    expect(fn, "cleanup_delete must exist in lib.sh").not.toBeNull();
    expect(fn![0]).toContain("--yes");
  });

  it("cleanup_delete records a failure rather than only printing one", () => {
    const fn = /cleanup_delete\(\)\s*\{[\s\S]*?\n\}/.exec(lib);
    expect(fn![0]).toContain("E2E_LEAK_COUNT");
  });

  it("cleanup_verdict turns a PASSING flow red on a leak", () => {
    const fn = /cleanup_verdict\(\)\s*\{[\s\S]*?\n\}/.exec(lib);
    expect(fn, "cleanup_verdict must exist in lib.sh").not.toBeNull();
    expect(fn![0]).toContain("E2E_LEAK_EXIT");
  });

  it("the leak exit code is distinct from an assertion failure and a precondition failure", () => {
    // 1 = an assertion failed. 2 = a precondition failed (no jq, no binary,
    // unsafe target). A leak must be neither, or a reader cannot tell a broken
    // CONTRACT from a dirty ORG without parsing prose.
    const declared = /E2E_LEAK_EXIT=(\d+)/.exec(lib);
    expect(declared).not.toBeNull();
    expect(["1", "2"]).not.toContain(declared![1]);
  });
});

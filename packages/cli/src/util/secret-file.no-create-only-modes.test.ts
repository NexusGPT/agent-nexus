import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE GATE THAT KEEPS THE CLASS DEAD.
 *
 * The class is: a security property set at CREATE time and never re-asserted.
 * Its one spelling in this repository is a `mode:` option on `fs.writeFileSync`
 * or `fs.mkdirSync` — which `open(2)`/`mkdir(2)` honour only when they have to
 * create the path, and ignore completely when it is already there. Every such
 * site read as deliberate hardening and hardened nothing on an existing file.
 *
 * Fixing the four sites that existed leaves nothing stopping the fifth. So the
 * shape itself is refused outside `secret-file.ts`, where the `mode:` is paired
 * with the `chmod` that makes it true. Anyone who adds a credential write now
 * either routes through the helper or fails this test by name.
 *
 * ⚠️ AN EMPTY SCAN IS A PASS THAT MEASURED NOTHING, so the population and the
 * detector are both asserted before the verdict is read.
 */

const PACKAGES = ["packages/cli/src", "packages/mcp-server/src"] as const;
const REPO = path.resolve(__dirname, "../../../..");

/** `secret-file.ts` is the ONE place the shape is correct — it chmods afterwards. */
const HELPER_BASENAMES = new Set(["secret-file.ts"]);

const CREATE_ONLY_MODE = /mode:\s*0o[0-7]+/;

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      if (HELPER_BASENAMES.has(entry.name)) continue;
      found.push(full);
    }
  };
  for (const pkg of PACKAGES) walk(path.join(REPO, pkg));
  return found;
}

describe("no create-only permission modes outside the secret-file helper", () => {
  it("scans a non-empty population, so a pass cannot be vacuous", () => {
    expect(sourceFiles().length).toBeGreaterThan(50);
  });

  it("detects the shape when it IS present — the detector's own control", () => {
    // The helper is the one file that legitimately carries it. If the regex ever
    // stops matching there, every verdict below is an empty scan wearing a tick.
    const helper = fs.readFileSync(
      path.join(REPO, "packages/cli/src/util/secret-file.ts"),
      "utf-8"
    );
    expect(CREATE_ONLY_MODE.test(helper)).toBe(true);
  });

  it("finds no `mode:` option on a write or a mkdir anywhere else", () => {
    const offenders = sourceFiles()
      .filter((file) => CREATE_ONLY_MODE.test(fs.readFileSync(file, "utf-8")))
      .map((file) => path.relative(REPO, file));

    expect(offenders).toEqual([]);
  });
});

describe("the helper is mirrored byte for byte across the two packages", () => {
  /**
   * `@agent-nexus/cli` and `@agent-nexus/mcp-server` write the SAME
   * `~/.nexus-mcp/config.json` and have no dependency edge between them, so the
   * helper cannot be shared by import. It is shared by copy, and a copy with no
   * gate is two helpers that agree today.
   */
  it("holds the two copies identical", () => {
    const cli = fs.readFileSync(path.join(REPO, "packages/cli/src/util/secret-file.ts"), "utf-8");
    const mcp = fs.readFileSync(path.join(REPO, "packages/mcp-server/src/secret-file.ts"), "utf-8");

    expect(cli).not.toBe(""); // both reads landed
    expect(mcp).toBe(cli);
  });
});

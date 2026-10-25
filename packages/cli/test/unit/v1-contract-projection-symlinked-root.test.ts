import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { checkContractSource } from "../../scripts/v1-contract-projection";
import { WORKSPACE_SOURCE_ALIASES } from "../../vitest.aliases";

/**
 * `scripts/v1-contract-projection.ts` checks, at load, that the contract source it imports
 * is the one `vitest.aliases.ts` names. The table holds paths `realpathSync` resolved; the
 * script's own root comes from its module URL, which a runner that PRESERVES symlinks
 * leaves as the checkout was reached — on macOS, any checkout under `/tmp` is reached
 * through a symlink to `/private/tmp`. A raw comparison of the two refuses a correct tree,
 * and the generator throws before it does anything.
 *
 * The check is called directly with the root that runner would hand it: the same checkout,
 * reached through a symlink. The CONTROL is the real root.
 */

const CLI_ROOT = realpathSync(path.resolve(__dirname, "../.."));
const DECLARED = WORKSPACE_SOURCE_ALIASES["@nexus/types/public-api-v1"];
const lab = mkdtempSync(path.join(os.tmpdir(), "projection-symlinked-root-"));
afterAll(() => rmSync(lab, { recursive: true, force: true }));

/** The repository root, reached through a symlink, and this package under it. */
const LINK = path.join(lab, "checkout");
symlinkSync(path.resolve(CLI_ROOT, "../.."), LINK, "dir");
const CLI_ROOT_VIA_LINK = path.join(LINK, "packages", "cli");

describe("the projection's alias check under a symlinked checkout", () => {
  it("CONTROL: the table names a realpath, and the link root is NOT one", () => {
    expect(DECLARED).toBe(realpathSync(DECLARED ?? ""));
    expect(CLI_ROOT_VIA_LINK).not.toBe(realpathSync(CLI_ROOT_VIA_LINK));
  });

  it("CONTROL: accepts the real root", () => {
    expect(() => checkContractSource(CLI_ROOT, DECLARED)).not.toThrow();
  });

  it("accepts the same checkout reached through a symlink", () => {
    expect(() => checkContractSource(CLI_ROOT_VIA_LINK, DECLARED)).not.toThrow();
  });

  it("still refuses a table naming a different file", () => {
    expect(() => checkContractSource(CLI_ROOT, path.join(CLI_ROOT, "vitest.aliases.ts"))).toThrow(
      /The contract source moved/
    );
  });
});

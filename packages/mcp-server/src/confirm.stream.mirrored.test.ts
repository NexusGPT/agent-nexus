import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * THE GATE THAT KEEPS THE TWO COPIES OF THE PROMPT PREDICATE ONE PREDICATE.
 *
 * `@agent-nexus/cli` and `@agent-nexus/mcp-server` both ask a human for an API
 * key and both write the SAME `~/.nexus-mcp/config.json`, and there is no
 * dependency edge between them — neither depends on the other, and the CLI
 * declares no `main`, `types` or `exports` at all, so nothing can import from
 * it. `confirm.stream.ts` therefore cannot be shared by import, and a copy with
 * no gate is two predicates that agree today.
 *
 * `nexus-mcp login > out.log` blocked on a question written into its own log
 * file while the reasoning that prevents it sat in the other package. That is
 * what the copy is for; this is what stops the copy drifting back apart.
 *
 * 🔴 THE PREDICATE IS A FAMILY, NOT A FILE. `confirm.stream.ts` plus any
 * `confirm.stream.*.ts` leaf beside it. Gating only the stem would leave each
 * leaf an ungated copy — the same hole one file further down — so the BASENAME
 * SET is asserted equal before any content is compared: a leaf added on one side
 * and not the other reds here rather than drifting in silence.
 *
 * ⚠️ AN EMPTY SCAN IS A PASS THAT MEASURED NOTHING, so the population and the
 * content are asserted separately and the population arm comes first.
 *
 * This is the same arrangement, for the same reason, as the `secret-file.*`
 * family beside this file — `packages/cli/src/util/secret-file.ts`'s header
 * carries that argument in full, and
 * `secret-file.no-create-only-modes.test.ts` carries its gate.
 *
 * ── WHY THIS GATE LIVES HERE RATHER THAN IN THE CLI ─────────────────────────
 *
 * `ci-affected.ts`'s `test_vitest.packages` names `@agent-nexus/cli` as well as
 * `@agent-nexus/mcp-server`, and `pr-checks.yml`'s shard matrix is static — so a
 * diff touching ONLY `packages/cli` still runs this package's suite, and this
 * gate sees a CLI-side drift. It also runs in the `pnpm --filter
 * @agent-nexus/mcp-server test` a lane executes by hand, which is the only
 * verification a `cluster/*` member PR ever gets.
 */

const REPO = path.resolve(__dirname, "../../..");
const CLI_DIR = path.join(REPO, "packages/cli/src/util");
const MCP_DIR = path.join(REPO, "packages/mcp-server/src");

/** Every mirrored predicate file in a directory, sorted. Specs are not mirrored. */
const mirrored = (dir: string): string[] =>
  fs
    .readdirSync(dir)
    .filter((n) => n.startsWith("confirm.stream") && n.endsWith(".ts") && !n.endsWith(".test.ts"))
    .sort();

describe("the prompt-stream predicate is mirrored byte for byte across the two packages", () => {
  it("resolves a repo root that holds both packages, so the reads below are not against nothing", () => {
    // Without this, a wrong `..` count makes `readdirSync` throw — which is
    // loud — but a correct count against a MOVED package would silently scan an
    // unrelated directory and compare two empty lists with each other.
    expect(fs.existsSync(path.join(CLI_DIR, "confirm.ts"))).toBe(true);
    expect(fs.existsSync(path.join(MCP_DIR, "config.ts"))).toBe(true);
  });

  it("mirrors a non-empty family, so the comparison below cannot be vacuous", () => {
    // The stem must be among them, or the filter has stopped matching the
    // predicate and every comparison below would be an empty list against
    // itself.
    expect(mirrored(CLI_DIR)).toContain("confirm.stream.ts");
    expect(mirrored(MCP_DIR)).toContain("confirm.stream.ts");
  });

  it("holds the same files on both sides", () => {
    expect(mirrored(MCP_DIR)).toEqual(mirrored(CLI_DIR));
  });

  it("holds every pair identical", () => {
    for (const name of mirrored(CLI_DIR)) {
      const cli = fs.readFileSync(path.join(CLI_DIR, name), "utf-8");
      const mcp = fs.readFileSync(path.join(MCP_DIR, name), "utf-8");

      expect(cli, `${name} read empty on the cli side`).not.toBe("");
      expect(mcp, `${name} differs between the two packages`).toBe(cli);
    }
  });

  it("states the mirror obligation in the copy itself, so a reader of either side learns of the other", () => {
    // The gate is mechanical and the header is not redundant with it: nothing
    // runs this suite in the public mirror repo, and a reader editing the CLI's
    // copy meets the header long before they meet a red test.
    const text = fs.readFileSync(path.join(MCP_DIR, "confirm.stream.ts"), "utf-8");

    expect(text).toContain("MIRRORED, BYTE FOR BYTE");
    expect(text).toContain("confirm.stream.mirrored.test.ts");
  });

  it("carries a debt marker with both a ceiling and an upgrade trigger", () => {
    // A marker with no trigger is legal and is reported as `no-trigger` by the
    // ledger, which is the alarm it exists to raise. This asserts the pair.
    const text = fs.readFileSync(path.join(MCP_DIR, "confirm.stream.ts"), "utf-8");

    expect(text).toContain("debt:");
    expect(text).toContain("Ceiling:");
    expect(text).toContain("Upgrade trigger:");
  });
});

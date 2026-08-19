/**
 * THE SWEEP MUST NEVER PUT A CREDENTIAL INTO A CI LOG.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE LEAF THIS EXISTS FOR, AND WHY THE EXISTING GATE IS NOT ENOUGH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `vibe git-credentials` returns this organisation's git push token. It takes no
 * input, exits 0 and emits clean JSON, so every promotion rule says yes to it:
 * no required positional, no required option, `--json` on a read. `sweep.sh`
 * prints a slice of a leaf's output into the CI log on failure, and that log is
 * readable by anyone with repository access.
 *
 * It is already fenced ONE way. `probe-barrier.ts` gives it a `third-party`
 * barrier, and `probe-barrier.test.ts` fails if a barrier'd leaf is classified
 * `safe` — verified by mutation: it reds with `[ 'vibe git-credentials' ]`.
 *
 * 🚨 THAT FENCE IS A TABLE, AND A TABLE ONLY CATCHES WHAT SOMEBODY REMEMBERED TO
 * PUT IN IT. `probe-barrier.ts`'s own header says it cannot demand an entry for a
 * new leaf, because whether an act reveals a secret is not derivable from a
 * commander tree. A NEVER-SWEEP denylist would have had exactly the same shape
 * and exactly the same hole. Three things walk past any table:
 *
 *   1. A NEW credential-returning leaf whose author never adds an entry.
 *   2. A leaf whose RESPONSE gains a token field later. No CLI source changes,
 *      so no table moves and no review ever sees it.
 *   3. A secret nested inside a list nobody reads by hand.
 *
 * `scripts/scan-response.py` derives its answer from the BYTES THE COMMAND
 * RETURNED, so none of the three gets past it. This spec keeps that scanner
 * honest and keeps it WIRED — an unwired gate and an absent one are the same
 * green.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SPEC CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * It does not invoke the live API, so it cannot prove today's responses are
 * clean — only that the instrument works and is connected. The end-to-end proof
 * is a mutation against staging: classify `vibe git-credentials` as `safe`, run
 * the sweep, and it FAILs with `SECRET-SHAPED RESPONSE: pushToken (len 40)`
 * while the 40-character value appears nowhere in the log.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNER = join(PACKAGE_ROOT, "scripts", "scan-response.py");
const SWEEP = join(PACKAGE_ROOT, "scripts", "sweep.sh");

/** Run the scanner over one payload. Returns its exit code and what it printed. */
function scan(payload: string): { code: number; stdout: string } {
  try {
    const stdout = execFileSync("python3", [SCANNER], {
      input: payload,
      encoding: "utf8"
    });
    return { code: 0, stdout };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? -1, stdout: failure.stdout ?? "" };
  }
}

describe("the sweep never leaks a secret", () => {
  it("passes its own self-test, which asserts in BOTH directions", () => {
    // The scanner's table is checked for having catching AND clean cases, so a
    // future edit cannot quietly delete every negative and stay green.
    const output = execFileSync("python3", [SCANNER, "--self-test"], { encoding: "utf8" });
    expect(output).toContain("self-test ok");
  });

  it("catches the exact shape that is already in the tree", () => {
    // `vibe-wire-types.ts` declares `pushToken: string`. This is that response.
    const result = scan(JSON.stringify({ username: "u", pushToken: "a".repeat(40) }));
    expect(result.code).toBe(2);
    expect(result.stdout).toContain("pushToken");
  });

  it("prints the KEY and the LENGTH and NEVER the value", () => {
    // This is the whole security property. What this prints goes to a CI log.
    const secret = "b".repeat(40);
    const result = scan(JSON.stringify({ pushToken: secret }));
    expect(result.code).toBe(2);
    expect(result.stdout).not.toContain(secret);
    expect(result.stdout).toMatch(/len 40/);
  });

  it("stays clean on the two swept leaves that are closest to firing", () => {
    // `credential list` is already `safe` and swept on every CLI PR. `auth
    // whoami` returns a deliberately MASKED key. A scanner that reddens either
    // is one nobody will keep.
    const credentialList = scan(
      JSON.stringify({
        data: [{ id: "1", name: "n", service: "s", status: "ACTIVE", lastUsedAt: "2026-01-01" }]
      })
    );
    expect(credentialList.code).toBe(0);

    const whoami = scan(JSON.stringify({ key: "nxs_u_83...ecf8", user: "a@b.c" }));
    expect(whoami.code).toBe(0);
  });

  it("is INVOKED by sweep.sh — an unwired gate reads exactly like a passing one", () => {
    // The INVOCATION, never the mention. This assertion was written as
    // `toContain("scan-response.py")` and it survived a mutation that replaced
    // the call with `/dev/null`, because the script also names the file in a
    // comment. A test that stays green under the mutation it exists to catch is
    // not a weaker test — it is no test, and it reads identically to a real one.
    const sweep = readFileSync(SWEEP, "utf8");
    expect(sweep).toMatch(/python3\s+"\$SCRIPT_DIR\/scan-response\.py"/);
  });

  it("prints the NOT-JSON marker, which is the only thing that licenses a preview", () => {
    // A python traceback exits 1 exactly like "not JSON" does. The exit code
    // alone therefore cannot tell the caller whether it may quote the payload.
    const result = scan("Usage: nexus [options]");
    expect(result.code).toBe(1);
    expect(result.stdout.trim()).toBe("NOT-JSON");
  });

  it("never previews a payload the scanner did not read — the bug bugbot caught", () => {
    // The first version of this gate had `*)` fall through to the JSON-parse
    // WARN, which prints the first characters of `$out`. A scanner crash, a
    // missing interpreter or any unexpected status therefore previewed a
    // response nothing had scanned — reintroducing the exact leak, inside the
    // gate's own error path.
    const sweep = readFileSync(SWEEP, "utf8");

    // The preview is reachable ONLY behind the positive marker.
    expect(sweep).toMatch(/if\s*\[\[\s*"\$scan_out"\s*==\s*"NOT-JSON"\s*\]\]/);

    // Every other status is UNMEASURED, and UNMEASURED is a FAIL that quotes
    // nothing. Three outcomes, never two: read, refused, and not-read.
    expect(sweep).toContain("SECRET SCAN UNMEASURED");
    const unmeasured = sweep.split("SECRET SCAN UNMEASURED").slice(1);
    expect(unmeasured.length).toBeGreaterThanOrEqual(2);
    for (const branch of unmeasured) {
      const line = branch.slice(0, branch.indexOf("\n"));
      expect(line).not.toContain("$preview");
      expect(line).not.toContain("$out");
    }
  });

  it("treats a secret as a FAIL in every mode, never a WARN", () => {
    // `--strict` promotes WARN to FAIL, so a WARN here would be a gate that is
    // off by default and on in CI. A leaf returning a live credential is not a
    // severity anyone gets to tune down.
    const sweep = readFileSync(SWEEP, "utf8");
    const secretBranch = sweep.slice(sweep.indexOf("SECRET-SHAPED RESPONSE"));
    const line = secretBranch.slice(0, secretBranch.indexOf("\n"));
    expect(sweep).toContain("FAIL|%s|SECRET-SHAPED RESPONSE");
    expect(line).not.toContain("WARN");
  });

  it("resolves the scanner beside the script, not from the caller's directory", () => {
    // sweep.sh is invoked as `bash packages/cli/scripts/sweep.sh` from the repo
    // root in CI and from this package by hand. A relative path would resolve to
    // one of the two and silently skip the scan in the other — and a skipped
    // scan prints PASS.
    const sweep = readFileSync(SWEEP, "utf8");

    // SCRIPT_DIR has to be assigned ABOVE run_leaf. Bash resolves at call time,
    // so a definition below works today and breaks the moment anything calls
    // run_leaf earlier — the kind of break that shows up as a clean sweep.
    expect(sweep.indexOf("SCRIPT_DIR=")).toBeLessThan(sweep.indexOf("run_leaf()"));
  });
});

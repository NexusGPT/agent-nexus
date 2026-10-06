/**
 * `check-publish-pin.ts` run as a process, the way a workflow runs it, for the
 * refusals it makes BEFORE any network call.
 *
 * These are the arms a unit test of `checkPublishPin` cannot reach: they live in
 * `main()`, and the one that matters most is a runner invoking the gate without
 * `--release-ref`. Without it the gate would judge the bundle against upstream
 * head — the unsatisfiable race the deadline exists to remove — so on a runner
 * its absence is refused rather than defaulted.
 *
 * Both arms stop before the first fetch, so they need no credential and no
 * network, and `GITHUB_ACTIONS=true` also disables the local `gh auth token`
 * fallback, which would otherwise answer from this machine's own login.
 *
 * Run under Node's own type stripping, never a loader — see
 * `src/type-stripped-script.ts`.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { typeStrippedScriptArgv } from "../../src/type-stripped-script";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Async on purpose: a `spawnSync` here would block this worker's event loop for
 * the child's whole lifetime — the cost `test/id-thread/id-thread-sweep.test.ts`
 * documents.
 */
async function runOnARunner(
  args: string[]
): Promise<{ status: number | null; stderr: string; outputs: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-pin-entry-"));
  const outputFile = path.join(dir, "github-output");
  fs.writeFileSync(outputFile, "");
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME };
  env.GITHUB_ACTIONS = "true";
  env.GITHUB_OUTPUT = outputFile;
  const proc = spawn(
    process.execPath,
    [...typeStrippedScriptArgv("scripts/check-publish-pin.ts"), ...args],
    { cwd: CLI_ROOT, env }
  );
  let stderr = "";
  proc.stderr.setEncoding("utf-8").on("data", (chunk: string) => (stderr += chunk));
  const status = await new Promise<number | null>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", resolve);
  });
  const outputs = fs.readFileSync(outputFile, "utf-8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { status, stderr, outputs };
}

describe("check-publish-pin.ts on a runner", () => {
  it("refuses UNCHECKED without --release-ref, and says why", async () => {
    const run = await runOnARunner([]);
    expect(run.stderr).toContain("[NO_RELEASE_REF]");
    expect(run.status).toBe(2);
    expect(run.outputs).toBe("verdict=unchecked\nwithhold=true\n");
  });

  it("refuses UNCHECKED with --release-ref but no credential for the monorepo", async () => {
    const run = await runOnARunner(["--release-ref", "c259672b55064b1a1eb85e2466b9652fb9025224"]);
    expect(run.stderr).toContain("[NO_RELEASE_TOKEN]");
    expect(run.status).toBe(2);
    expect(run.outputs).toBe("verdict=unchecked\nwithhold=true\n");
  });
});

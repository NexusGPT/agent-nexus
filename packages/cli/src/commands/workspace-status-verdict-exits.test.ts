import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * `nexus workspace status` CARRIES `live` IN ITS EXIT CODE — BOTH WAYS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 AN EMPTY REGISTRY IS NOT A FAILURE, AND THAT IS THE HALF THAT KEEPS THIS
 *    SHIPPABLE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This command reads the LOCAL mount registry and printed `live: yes|no` per row
 * at exit `0` either way. Its own help already warns that a mount deleted
 * server-side still appears here, which makes the exit code the only cheap way a
 * script learns that a drive it depends on is GONE — and it always said "fine".
 *
 * The cure exits non-zero when any recorded mount reads `no`. It must NOT exit
 * non-zero when there is nothing recorded: "No workspaces mounted." means the
 * registry is empty, which the help is careful to say is not a claim about what
 * the OS has mounted. A machine with no mounts is doing exactly what was asked
 * of it, and reddening it would be refusing correct work.
 *
 * ── WHY `local-failed` ──────────────────────────────────────────────────────
 *
 * No server is involved in this command at all. The category's own declaration
 * is the whole argument: "a local operation this CLI performed failed … nothing
 * about the caller's input is wrong and no retry against the API helps".
 * `remote-error` would name a host that was never contacted.
 *
 * ── THE REAL COMMAND TREE ───────────────────────────────────────────────────
 *
 * Every assertion drives `registerWorkspaceCommands` through commander with only
 * the mount REGISTRY replaced — this command speaks to no API, so there is no
 * client to stub. A spec walking its own table of expected outcomes asserts
 * against its own fixture and stays green with the defect restored.
 */
const { readMounts } = vi.hoisted(() => ({ readMounts: vi.fn() }));

// 🚨 ONLY THE REGISTRY IS REPLACED, AND LIVENESS IS NOT MOCKED AT ALL.
// `isMountLive` is a LOCAL function in `workspace.ts` — for the rclone engine it
// is `process.kill(pid, 0)`. A spec that stubbed the liveness test would assert
// against its own boolean; driving a REAL pid exercises the shipped predicate,
// and `process.pid` is the one pid a test can be certain is alive.
vi.mock("../workspace-mounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../workspace-mounts")>()),
  readMounts
}));

import { registerWorkspaceCommands } from "./workspace";

/** A recorded rclone mount. `alive: false` drops the pid, which is how a dead one reads. */
function mount(slug: string, alive: boolean) {
  return {
    slug,
    engine: "rclone" as const,
    shared: false,
    readOnly: false,
    orgId: "org_1",
    orgName: "Acme",
    profile: "default",
    mountPath: `/mnt/${slug}`,
    mountedAt: "2026-08-19T00:00:00.000Z",
    ...(alive ? { pid: process.pid } : {})
  };
}

function tree(): Command {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerWorkspaceCommands(program);
  return program;
}

async function run(): Promise<number | undefined> {
  const program = tree();
  const before = process.exitCode;
  process.exitCode = undefined;
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", "workspace", "status"]);
    return process.exitCode;
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    process.exitCode = before;
  }
}

async function runJson(): Promise<{ stdout: string; exitCode: number | undefined }> {
  const program = tree();
  const before = process.exitCode;
  process.exitCode = undefined;
  setJsonMode(true);
  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", "--json", "workspace", "status"]);
    return { stdout: out.join("\n"), exitCode: process.exitCode };
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    setJsonMode(false);
    process.exitCode = before;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("nexus workspace status", () => {
  it("still exits 0 when every recorded mount is live", async () => {
    readMounts.mockReturnValue({ a: mount("alpha", true), b: mount("beta", true) });

    expect(await run()).toBeUndefined();
  });

  it("exits NON-ZERO when a recorded mount is NOT live", async () => {
    readMounts.mockReturnValue({ a: mount("alpha", false) });

    expect(await run()).toBe(EXIT_CODES["local-failed"]);
  });

  it("still exits 0 on an EMPTY registry — nothing recorded is not a failure", async () => {
    // 🚨 THE CASE THAT KEEPS THE CURE FROM REFUSING CORRECT WORK. "No workspaces
    // mounted." is a machine doing exactly what was asked of it, and the help is
    // explicit that it is not a claim about what the OS has mounted.
    readMounts.mockReturnValue({});

    expect(await run()).toBeUndefined();
  });

  it("refuses on a MIXED registry — one dead row is enough", async () => {
    // A script gates on the drive it depends on, and it cannot know which row
    // that is. One dead mount has to be visible in `$?`.
    readMounts.mockReturnValue({ a: mount("alpha", true), b: mount("beta", false) });

    expect(await run()).toBe(EXIT_CODES["local-failed"]);
  });

  it("identifies the dead mount by PATH and ORG, not by slug alone", async () => {
    // 🚨 THE SAME SLUG CAN BE MOUNTED FOR TWO ORGANIZATIONS — `workspace status`
    // exists partly to show that, and a sibling spec asserts it. Under --json
    // this refusal REPLACES the rows, so a message naming only the slug leaves
    // the reader unable to tell WHICH of the two died, and the obvious next move
    // (`workspace unmount <slug>`, which resolves by ACTING ORG and takes no
    // path) can detach the LIVE one and leave the dead row behind. Found by
    // review; the first draft named slugs and told the reader to unmount.
    readMounts.mockReturnValue({
      a: { ...mount("shared", true), orgName: "Acme", mountPath: "/mnt/acme/shared" },
      b: { ...mount("shared", false), orgName: "Globex", mountPath: "/mnt/globex/shared" }
    });

    const { stdout } = await runJson();
    const doc = JSON.parse(stdout) as { error: { message: string; hint: string } };

    expect(doc.error.message).toContain("/mnt/globex/shared");
    expect(doc.error.message).toContain("Globex");
    // The LIVE mount's path must not be in the refusal at all — naming it would
    // point the reader at the one that is fine.
    expect(doc.error.message).not.toContain("/mnt/acme/shared");
    // And the hint must not instruct a resolution that can hit the wrong one.
    expect(doc.error.hint).toContain("ACTING ORG");
  });

  it("says the org is NOT RECORDED rather than omitting it", async () => {
    // Org is null for a mount made with a raw --api-key, which the help calls
    // "?" in the table. An omitted field would read as "no org", and this is the
    // document that replaces the table.
    readMounts.mockReturnValue({
      a: { ...mount("alpha", false), orgName: null, orgId: null }
    });

    const { stdout } = await runJson();
    const doc = JSON.parse(stdout) as { error: { message: string } };

    expect(doc.error.message).toContain("org not recorded");
  });

  it("names the dead slugs, so the reader does not have to re-run to find them", async () => {
    readMounts.mockReturnValue({ a: mount("alpha", true), b: mount("beta", false) });

    const { stdout } = await runJson();
    const doc = JSON.parse(stdout) as { error: { message: string } };

    // Under --json the error document REPLACES the rows, so the slug has to be
    // inside it — a message saying "some mount is not live" is not actionable,
    // and pointing at a `slug` field that is no longer on stdout would send the
    // reader to nothing.
    expect(doc.error.message).toContain("beta");
    expect(doc.error.message).not.toContain("alpha");
  });

  it("puts the ERROR document on stdout under --json when it refuses", async () => {
    readMounts.mockReturnValue({ a: mount("alpha", false) });

    const { stdout, exitCode } = await runJson();

    expect(exitCode).toBe(EXIT_CODES["local-failed"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { error?: { code?: unknown } }).error?.code).toBe(
      "CLI_LOCAL_FAILED"
    );
  });

  it("still puts the ROWS on stdout under --json when everything is live", async () => {
    // The other half. A cure that suppressed the rows on the healthy path would
    // satisfy every assertion above and destroy the command.
    readMounts.mockReturnValue({ a: mount("alpha", true) });

    const { stdout, exitCode } = await runJson();

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const rows = JSON.parse(stdout) as Array<{ slug?: unknown; live?: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("alpha");
    expect(rows[0].live).toBe("yes");
  });

  it("emits an EMPTY ARRAY, not an error, for an empty registry under --json", async () => {
    readMounts.mockReturnValue({});

    const { stdout, exitCode } = await runJson();

    expect(exitCode).toBeUndefined();
    expect(JSON.parse(stdout)).toEqual([]);
  });
});

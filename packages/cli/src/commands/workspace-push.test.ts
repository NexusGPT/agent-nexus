import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const uploadBatch = vi.fn();
const list = vi.fn();
const fakeClient = { workspaces: { uploadBatch, list } };

// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: () => fakeClient
}));

import { registerWorkspaceCommands } from "./workspace";
import {
  PACK_MAX_BYTES,
  PACK_MAX_FILES,
  packEntries,
  parseDestination,
  planPush
} from "./workspace-push";

async function run(
  argv: string[],
  json = false
): Promise<{ out: string; err: string; exitCode: typeof process.exitCode }> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerWorkspaceCommands(program);

  if (json) setJsonMode(true);
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errChunks.push(args.map((a) => String(a)).join(" "));
  });
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...(json ? ["--json"] : []), ...argv]);
  } catch {
    /* commander exitOverride throws on error — ignore, assert via exitCode */
  } finally {
    spy.mockRestore();
    errSpy.mockRestore();
    if (json) setJsonMode(false);
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return { out: chunks.join("\n"), err: errChunks.join("\n"), exitCode };
}

/** A throwaway tree: notes/{a.md,b.md,.DS_Store,.git/HEAD,sub/c.txt} plus a loose file. */
function makeTree(): { root: string; notes: string; loose: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-push-"));
  const notes = path.join(root, "notes");
  fs.mkdirSync(path.join(notes, "sub"), { recursive: true });
  fs.mkdirSync(path.join(notes, ".git"));
  fs.writeFileSync(path.join(notes, "a.md"), "alpha");
  fs.writeFileSync(path.join(notes, "b.md"), "bravo");
  fs.writeFileSync(path.join(notes, ".DS_Store"), "finder");
  fs.writeFileSync(path.join(notes, ".git", "HEAD"), "ref: main");
  fs.writeFileSync(path.join(notes, "sub", "c.txt"), "charlie");
  const loose = path.join(root, "loose.txt");
  fs.writeFileSync(loose, "loose");
  return { root, notes, loose };
}

function okRow(p: string) {
  return { path: p, success: true as const, size: 5, modifiedAt: "2026-09-18T00:00:00.000Z" };
}

function responseFor(paths: readonly string[]) {
  return {
    results: paths.map(okRow),
    successCount: paths.length,
    failureCount: 0,
    skippedCount: 0
  };
}

/** What the SDK was asked to send: the remote paths and the bytes, in order. */
async function sentFiles(
  callIndex = 0
): Promise<{ path: string; text: string; fileName?: string }[]> {
  const files = uploadBatch.mock.calls[callIndex]?.[1] as
    | { path: string; file: Blob; fileName?: string }[]
    | undefined;
  if (!files) throw new Error(`uploadBatch call ${callIndex} was not made`);
  return Promise.all(
    files.map(async (entry) => ({
      path: entry.path,
      text: await entry.file.text(),
      fileName: entry.fileName
    }))
  );
}

describe("parseDestination", () => {
  it("splits <slug>:<folder> and normalises the folder's slashes", () => {
    expect(parseDestination("docs")).toEqual({ slug: "docs", prefix: "" });
    expect(parseDestination("docs:reports")).toEqual({ slug: "docs", prefix: "reports" });
    expect(parseDestination("docs:/reports/q3/")).toEqual({ slug: "docs", prefix: "reports/q3" });
  });
});

describe("planPush — the cp shape, and what is left out", () => {
  let tree: ReturnType<typeof makeTree>;
  beforeEach(() => (tree = makeTree()));
  afterEach(() => fs.rmSync(tree.root, { recursive: true, force: true }));

  it("a folder lands under its own name; dot-names inside it are left out and counted", () => {
    const plan = planPush([tree.notes], "reports", false);
    expect(plan.entries.map((e) => e.remotePath)).toEqual([
      "reports/notes/a.md",
      "reports/notes/b.md",
      "reports/notes/sub/c.txt"
    ]);
    expect(plan.hiddenSkipped).toBe(2);
    expect(plan.oversized).toEqual([]);
  });

  it("--include-hidden walks into dot-names too", () => {
    const plan = planPush([tree.notes], "", true);
    expect(plan.entries.map((e) => e.remotePath)).toEqual([
      "notes/.DS_Store",
      "notes/.git/HEAD",
      "notes/a.md",
      "notes/b.md",
      "notes/sub/c.txt"
    ]);
    expect(plan.hiddenSkipped).toBe(0);
  });

  it("a named file lands at <prefix>/<basename>, whatever it is called", () => {
    const hidden = path.join(tree.root, ".env");
    fs.writeFileSync(hidden, "SECRET=1");
    const plan = planPush([tree.loose, hidden], "cfg", false);
    expect(plan.entries.map((e) => e.remotePath)).toEqual(["cfg/loose.txt", "cfg/.env"]);
    expect(plan.hiddenSkipped).toBe(0);
  });

  it("a file at the pack ceiling is oversized, never an entry", () => {
    const big = path.join(tree.root, "big.bin");
    fs.writeFileSync(big, "");
    fs.truncateSync(big, PACK_MAX_BYTES);
    const plan = planPush([big, tree.loose], "", false);
    expect(plan.entries.map((e) => e.remotePath)).toEqual(["loose.txt"]);
    expect(plan.oversized.map((e) => e.remotePath)).toEqual(["big.bin"]);
  });

  it("two sources on one destination are set apart, naming both — they would race on one key", () => {
    const other = path.join(tree.root, "other");
    fs.mkdirSync(other);
    const twin = path.join(other, "loose.txt");
    fs.writeFileSync(twin, "second");
    const plan = planPush([tree.loose, twin], "", false);
    expect(plan.entries.map((e) => e.localPath)).toEqual([tree.loose]);
    expect(plan.duplicates).toEqual([{ remotePath: "loose.txt", first: tree.loose, second: twin }]);
  });

  it("a symlinked file inside a walked folder is followed, like cp -L", () => {
    fs.symlinkSync(tree.loose, path.join(tree.notes, "linked.txt"));
    const plan = planPush([tree.notes], "", false);
    expect(plan.entries.map((e) => e.remotePath)).toContain("notes/linked.txt");
    expect(plan.dangling).toEqual([]);
  });

  it("a dangling symlink is recorded, never silently dropped", () => {
    const dangling = path.join(tree.notes, "gone.txt");
    fs.symlinkSync(path.join(tree.root, "does-not-exist"), dangling);
    const plan = planPush([tree.notes], "", false);
    expect(plan.dangling).toEqual([dangling]);
    expect(plan.entries.map((e) => e.remotePath)).not.toContain("notes/gone.txt");
  });

  it("a symlink loop is recorded where it is met, never a raw ELOOP 32 hops down", () => {
    // `sub/up -> ..` makes `sub/up/sub/up/…` resolve forever; following it
    // like `cp -L` threw ELOOP out of the walk as CLI_UNKNOWN_ERROR.
    const loopDir = path.join(tree.notes, "loop");
    fs.mkdirSync(path.join(loopDir, "sub"), { recursive: true });
    const up = path.join(loopDir, "sub", "up");
    fs.symlinkSync("..", up);
    const plan = planPush([loopDir], "", false);
    expect(plan.loops).toEqual([up]);
    expect(plan.dangling).toEqual([]);
  });

  it("a link to itself is a loop too, not a missing target — its target exists", () => {
    const self = path.join(tree.notes, "self");
    fs.symlinkSync("self", self);
    const plan = planPush([tree.notes], "", false);
    expect(plan.loops).toEqual([self]);
    expect(plan.dangling).toEqual([]);
  });
});

describe("packEntries — at most 100 files and under 45 MB per request", () => {
  const entry = (i: number, size = 1) => ({ localPath: `/x/${i}`, remotePath: `${i}`, size });

  it("closes a pack at the file cap", () => {
    const packs = packEntries(Array.from({ length: PACK_MAX_FILES + 1 }, (_, i) => entry(i)));
    expect(packs.map((p) => p.length)).toEqual([PACK_MAX_FILES, 1]);
  });

  it("closes a pack before the byte ceiling would be crossed", () => {
    const third = Math.floor(PACK_MAX_BYTES / 3) + 1;
    const packs = packEntries([entry(1, third), entry(2, third), entry(3, third)]);
    expect(packs.map((p) => p.map((e) => e.remotePath))).toEqual([["1", "2"], ["3"]]);
  });

  it("keeps order across packs", () => {
    const packs = packEntries(Array.from({ length: 250 }, (_, i) => entry(i)));
    expect(packs.flat().map((e) => e.remotePath)).toEqual(
      Array.from({ length: 250 }, (_, i) => `${i}`)
    );
  });
});

describe("nexus workspace push", () => {
  let tree: ReturnType<typeof makeTree>;
  beforeEach(() => {
    vi.clearAllMocks();
    tree = makeTree();
  });
  afterEach(() => {
    setJsonMode(false);
    fs.rmSync(tree.root, { recursive: true, force: true });
  });

  it("sends the folder's files with their bytes, remote paths and names, replacing by default", async () => {
    uploadBatch.mockImplementation(async (_slug: string, files: { path: string }[]) =>
      responseFor(files.map((f) => f.path))
    );
    const { exitCode, out } = await run(["workspace", "push", "docs:reports", tree.notes]);

    expect(uploadBatch).toHaveBeenCalledTimes(1);
    expect(uploadBatch.mock.calls[0][0]).toBe("docs");
    expect(uploadBatch.mock.calls[0][2]).toEqual({ workspaceId: undefined, noClobber: false });
    expect(await sentFiles()).toEqual([
      { path: "reports/notes/a.md", text: "alpha", fileName: "a.md" },
      { path: "reports/notes/b.md", text: "bravo", fileName: "b.md" },
      { path: "reports/notes/sub/c.txt", text: "charlie", fileName: "c.txt" }
    ]);
    expect(exitCode).toBe(0);
    expect(out).toContain('3 pushed to "docs"');
    expect(out).toContain("2 hidden entries left out");
  });

  it("--no-clobber asks the server to skip existing paths, and a skipped row leaves the exit at 0", async () => {
    uploadBatch.mockResolvedValue({
      results: [
        okRow("loose.txt"),
        { path: "notes/a.md", success: false, skipped: true, error: "already exists" }
      ],
      successCount: 1,
      failureCount: 0,
      skippedCount: 1
    });
    const { exitCode, out } = await run([
      "workspace",
      "push",
      "docs",
      tree.loose,
      tree.notes,
      "--no-clobber"
    ]);
    expect(uploadBatch.mock.calls[0][2]).toEqual({ workspaceId: undefined, noClobber: true });
    expect(exitCode).toBe(0);
    expect(out).toContain("skipped: already exists");
    expect(out).toContain('1 pushed to "docs", 1 skipped');
  });

  it("a FAILED row is printed and the run exits remote-error (6)", async () => {
    uploadBatch.mockResolvedValue({
      results: [
        okRow("notes/a.md"),
        { path: "notes/b.md", success: false, skipped: false, error: "socket hang up" }
      ],
      successCount: 1,
      failureCount: 1,
      skippedCount: 0
    });
    const { exitCode, out } = await run(["workspace", "push", "docs", tree.notes]);
    expect(exitCode).toBe(6);
    expect(out).toContain("notes/b.md  FAILED: socket hang up");
    expect(out).toContain('1 pushed to "docs", 1 failed');
  });

  it("splits 101 files into two requests and merges the answers into one document", async () => {
    const many = path.join(tree.root, "many");
    fs.mkdirSync(many);
    for (let i = 0; i < 101; i++)
      fs.writeFileSync(path.join(many, `f${String(i).padStart(3, "0")}`), "x");
    uploadBatch.mockImplementation(async (_slug: string, files: { path: string }[]) =>
      responseFor(files.map((f) => f.path))
    );
    const { out, exitCode } = await run(["workspace", "push", "docs", many], true);
    expect(uploadBatch).toHaveBeenCalledTimes(2);
    expect((await sentFiles(0)).length).toBe(100);
    expect((await sentFiles(1)).length).toBe(1);
    const doc = JSON.parse(out);
    expect(doc.successCount).toBe(101);
    expect(doc.results).toHaveLength(101);
    expect(doc.results[100].path).toBe("many/f100");
    expect(exitCode).toBe(0);
  });
});

describe("nexus workspace push — refusals, --shared and --json", () => {
  let tree: ReturnType<typeof makeTree>;
  beforeEach(() => {
    vi.clearAllMocks();
    tree = makeTree();
  });
  afterEach(() => {
    setJsonMode(false);
    fs.rmSync(tree.root, { recursive: true, force: true });
  });

  it("refuses a file at or above the pack ceiling before sending anything", async () => {
    const big = path.join(tree.root, "big.bin");
    fs.writeFileSync(big, "");
    fs.truncateSync(big, PACK_MAX_BYTES);
    const { exitCode, err } = await run(["workspace", "push", "docs", big]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("big.bin (45.0 MB)");
  });

  it("refuses two sources on one destination before sending anything", async () => {
    const other = path.join(tree.root, "other");
    fs.mkdirSync(other);
    fs.writeFileSync(path.join(other, "loose.txt"), "second");
    const { exitCode, err } = await run([
      "workspace",
      "push",
      "docs",
      tree.loose,
      path.join(other, "loose.txt")
    ]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("Two sources land on one destination: loose.txt");
  });

  it("refuses a dangling symlink before sending anything", async () => {
    fs.symlinkSync(path.join(tree.root, "nope"), path.join(tree.notes, "gone.txt"));
    const { exitCode, err } = await run(["workspace", "push", "docs", tree.notes]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("Symlink target does not exist");
  });

  it("refuses a name the server's path rules refuse, before sending anything — one bad name no longer 400s a whole pack", async () => {
    // A backslash is legal in a Linux filename and refused by the server's
    // path schema; sent, the whole pack came back 400 naming `paths[N]`.
    fs.writeFileSync(path.join(tree.notes, "back\\slash.md"), "x");
    const { exitCode, err } = await run(["workspace", "push", "docs", tree.notes]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("path must not contain backslashes");
    expect(err).toContain("notes/back\\slash.md");
  });

  it("refuses a destination folder the server's path rules refuse", async () => {
    const { exitCode, err } = await run(["workspace", "push", "docs:../up", tree.loose]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("path traversal segments (..) are not allowed");
  });

  it("refuses a file this process cannot read, before sending anything", async () => {
    const sealed = path.join(tree.notes, "sealed.md");
    fs.writeFileSync(sealed, "secret");
    fs.chmodSync(sealed, 0o000);
    try {
      const { exitCode, err } = await run(["workspace", "push", "docs", tree.notes]);
      expect(uploadBatch).not.toHaveBeenCalled();
      expect(exitCode).toBe(5);
      expect(err).toContain("Cannot read");
      expect(err).toContain("sealed.md");
    } finally {
      fs.chmodSync(sealed, 0o644);
    }
  });

  it("a file that becomes unreadable between the plan and the send is one FAILED row; its pack still goes up", async () => {
    // The plan admitted it (readable then); the read at send time throws. The
    // mailbag bounces that file and delivers the rest, instead of the throw
    // reading as a request failure that bounces the whole pack.
    const late = path.join(tree.notes, "late.md");
    fs.writeFileSync(late, "x");
    uploadBatch.mockImplementation(async (_slug: string, files: { path: string }[]) =>
      responseFor(files.map((f) => f.path))
    );
    const realRead = fs.readFileSync;
    const readSpy = vi.spyOn(fs, "readFileSync").mockImplementation(((
      target: unknown,
      ...rest: unknown[]
    ) => {
      if (target === late)
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return (realRead as (...args: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.readFileSync);
    try {
      const { exitCode, out } = await run(["workspace", "push", "docs", tree.notes]);
      const sent = await sentFiles();
      expect(sent.map((f) => f.path)).toEqual(["notes/a.md", "notes/b.md", "notes/sub/c.txt"]);
      expect(out).toContain("notes/late.md  FAILED: could not read");
      // Every FAILED row is this machine's: local-failed (9), never remote-error.
      expect(exitCode).toBe(9);
    } finally {
      readSpy.mockRestore();
    }
  });

  it("a throw on a later pack keeps the landed rows and bounces the rest as failures", async () => {
    const many = path.join(tree.root, "many");
    fs.mkdirSync(many);
    for (let i = 0; i < 101; i++) {
      fs.writeFileSync(path.join(many, `f${String(i).padStart(3, "0")}`), "x");
    }
    uploadBatch
      .mockImplementationOnce(async (_slug: string, files: { path: string }[]) =>
        responseFor(files.map((f) => f.path))
      )
      .mockRejectedValueOnce(new Error("socket hang up"));
    const { out, exitCode } = await run(["workspace", "push", "docs", many], true);
    const doc = JSON.parse(out);
    expect(doc.successCount).toBe(100);
    expect(doc.failureCount).toBe(1);
    expect(doc.results[100]).toEqual({
      path: "many/f100",
      success: false,
      skipped: false,
      error: "socket hang up"
    });
    expect(exitCode).toBe(6);
  });

  it("a throw on the FIRST pack is the error document itself — nothing landed", async () => {
    uploadBatch.mockRejectedValueOnce(new Error("socket hang up"));
    const { out, err, exitCode } = await run(["workspace", "push", "docs", tree.notes]);
    expect(out).toBe("");
    expect(err).toContain("socket hang up");
    expect(exitCode).not.toBe(0);
  });

  it("refuses a source that does not exist before sending anything", async () => {
    const { exitCode, err } = await run([
      "workspace",
      "push",
      "docs",
      path.join(tree.root, "nope")
    ]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("No such file or folder");
  });

  it("refuses an empty push, naming the hidden entries it left out", async () => {
    const onlyHidden = path.join(tree.root, "onlyhidden");
    fs.mkdirSync(onlyHidden);
    fs.writeFileSync(path.join(onlyHidden, ".DS_Store"), "");
    const { exitCode, err } = await run(["workspace", "push", "docs", onlyHidden]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("1 hidden, left out");
  });

  it("--shared pushes into the admin-shared twin by id, and refuses when there is none", async () => {
    list.mockResolvedValue({
      workspaces: [
        { id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" },
        { id: "w-shared", slug: "docs", isShared: true, kind: "DRIVE" }
      ]
    });
    uploadBatch.mockResolvedValue(responseFor(["loose.txt"]));
    const ok = await run(["workspace", "push", "docs", tree.loose, "--shared"]);
    expect(uploadBatch.mock.calls[0][2]).toEqual({ workspaceId: "w-shared", noClobber: false });
    expect(ok.exitCode).toBe(0);

    vi.clearAllMocks();
    list.mockResolvedValue({
      workspaces: [{ id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" }]
    });
    const miss = await run(["workspace", "push", "docs", tree.loose, "--shared"]);
    expect(uploadBatch).not.toHaveBeenCalled();
    expect(miss.exitCode).not.toBe(0);
    expect(miss.err).toContain('No admin-shared workspace has the slug "docs"');
    // A categorised refusal: `not-found`, never CLI_UNKNOWN_ERROR / exit `failed`.
    expect(miss.exitCode).toBe(4);
  });

  it("--json is the merged server response and nothing else", async () => {
    const payload = responseFor(["notes/a.md", "notes/b.md", "notes/sub/c.txt"]);
    uploadBatch.mockResolvedValue(payload);
    const { out } = await run(["workspace", "push", "docs", tree.notes], true);
    expect(JSON.parse(out)).toEqual(payload);
  });
});

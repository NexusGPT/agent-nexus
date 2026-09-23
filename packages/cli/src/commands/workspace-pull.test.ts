import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const downloadFolderArchive = vi.fn();
const getFileUrl = vi.fn();
const list = vi.fn();
const fakeClient = { workspaces: { downloadFolderArchive, getFileUrl, list } };
const execFileSync = vi.fn();

// PARTIAL, via `importOriginal`: `workspace.ts` reads the `seconds` brand
// constructor off this module at load, and a total mock makes the suite fail
// to COLLECT — which reports as no tests, not as a red.
vi.mock("../client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client")>()),
  createClient: () => fakeClient
}));

// The unpack step is the one thing this command runs outside node. Recorded,
// never executed: what matters is the binary and argv it would hand the OS.
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFileSync: (...args: unknown[]) => execFileSync(...args)
}));

import { registerWorkspaceCommands } from "./workspace";
import { parseSource, unpackCommand } from "./workspace-pull";

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

/** A `Response` whose body streams these bytes. */
function bodyOf(text: string, status = 200): Response {
  return new Response(text, { status });
}

describe("parseSource", () => {
  it("splits <slug>:<folder> and normalises the folder's slashes", () => {
    expect(parseSource("docs")).toEqual({ slug: "docs", folder: "" });
    expect(parseSource("docs:/reports/q3/")).toEqual({ slug: "docs", folder: "reports/q3" });
  });
});

describe("unpackCommand — the system tool per platform", () => {
  it("unzip on macOS and Linux, overwriting quietly into the target", () => {
    expect(unpackCommand("darwin", "/t/a.zip", "/t/out")).toEqual({
      file: "unzip",
      args: ["-o", "-q", "/t/a.zip", "-d", "/t/out"]
    });
    expect(unpackCommand("linux", "/t/a.zip", "/t/out").file).toBe("unzip");
  });

  it("tar on Windows, which ships bsdtar and no unzip", () => {
    expect(unpackCommand("win32", "C:\\t\\a.zip", "C:\\t\\out")).toEqual({
      file: "tar",
      args: ["-xf", "C:\\t\\a.zip", "-C", "C:\\t\\out"]
    });
  });
});

describe("nexus workspace pull", () => {
  let out: string;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    out = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-pull-"));
  });
  afterEach(() => {
    setJsonMode(false);
    globalThis.fetch = realFetch;
    fs.rmSync(out, { recursive: true, force: true });
  });

  it("a folder: streams the archive to <out>/<name>.zip, unpacks it there, and removes the zip", async () => {
    downloadFolderArchive.mockResolvedValue(bodyOf("PK-zip-bytes"));
    const target = path.join(out, "q3");
    const { exitCode, outText } = await run([
      "workspace",
      "pull",
      "docs:reports",
      "--out",
      target
    ]).then((r) => ({ exitCode: r.exitCode, outText: r.out }));

    expect(downloadFolderArchive).toHaveBeenCalledWith("docs", {
      path: "reports",
      workspaceId: undefined
    });
    const zip = path.join(target, "reports.zip");
    expect(execFileSync).toHaveBeenCalledWith("unzip", ["-o", "-q", zip, "-d", target], {
      stdio: "pipe"
    });
    expect(fs.existsSync(zip)).toBe(false);
    expect(exitCode).toBe(0);
    expect(outText).toContain('Pulled "docs:reports"');
  });

  it("--keep-zip leaves the archive, named after the workspace for a root pull, with its bytes on disk", async () => {
    downloadFolderArchive.mockResolvedValue(bodyOf("PK-zip-bytes"));
    const { out: text } = await run(
      ["workspace", "pull", "docs", "--out", out, "--keep-zip"],
      true
    );
    const zip = path.join(out, "docs.zip");
    expect(fs.readFileSync(zip, "utf8")).toBe("PK-zip-bytes");
    expect(downloadFolderArchive).toHaveBeenCalledWith("docs", {
      path: undefined,
      workspaceId: undefined
    });
    expect(JSON.parse(text)).toEqual({
      success: true,
      message: `Pulled "docs" into ${out}`,
      bytes: 12,
      zip
    });
  });

  it("a failed unpack exits local-failed and leaves the archive where it is", async () => {
    downloadFolderArchive.mockResolvedValue(bodyOf("PK-zip-bytes"));
    execFileSync.mockImplementationOnce(() => {
      throw new Error("spawnSync unzip ENOENT");
    });
    const { exitCode, err } = await run(["workspace", "pull", "docs", "--out", out]);
    expect(exitCode).toBe(9);
    expect(err).toContain("Could not unpack");
    expect(fs.existsSync(path.join(out, "docs.zip"))).toBe(true);
  });
});

describe("nexus workspace pull — named files, refusals and --shared", () => {
  let out: string;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    out = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-pull-"));
  });
  afterEach(() => {
    setJsonMode(false);
    globalThis.fetch = realFetch;
    fs.rmSync(out, { recursive: true, force: true });
  });

  it("named files: one presigned link each, fetched and written under --out by base name", async () => {
    getFileUrl.mockImplementation(async (_slug: string, p: string) => ({
      url: `https://s3.invalid/${p}`
    }));
    globalThis.fetch = vi.fn(async (input: string | URL | Request) =>
      bodyOf(`bytes of ${String(input).split("/").pop()}`)
    ) as unknown as typeof globalThis.fetch;

    const { exitCode, out: text } = await run([
      "workspace",
      "pull",
      "docs:reports",
      "q3.pdf",
      "sub/q4.pdf",
      "--out",
      out
    ]);

    expect(getFileUrl).toHaveBeenCalledWith("docs", "reports/q3.pdf", { workspaceId: undefined });
    expect(getFileUrl).toHaveBeenCalledWith("docs", "reports/sub/q4.pdf", {
      workspaceId: undefined
    });
    expect(fs.readFileSync(path.join(out, "q3.pdf"), "utf8")).toBe("bytes of q3.pdf");
    expect(fs.readFileSync(path.join(out, "q4.pdf"), "utf8")).toBe("bytes of q4.pdf");
    expect(downloadFolderArchive).not.toHaveBeenCalled();
    expect(exitCode).toBe(0);
    expect(text).toContain('Pulled 2 files from "docs"');
  });

  it("a download that answers non-2xx exits remote-error", async () => {
    getFileUrl.mockResolvedValue({ url: "https://s3.invalid/gone.pdf" });
    globalThis.fetch = vi.fn(async () =>
      bodyOf("denied", 403)
    ) as unknown as typeof globalThis.fetch;
    const { exitCode, err } = await run(["workspace", "pull", "docs", "gone.pdf", "--out", out]);
    expect(exitCode).toBe(6);
    expect(err).toContain("answered HTTP 403");
  });

  it("--json on named files is ONE document — the per-file lines are human channel only", async () => {
    getFileUrl.mockResolvedValue({ url: "https://s3.invalid/a.md" });
    globalThis.fetch = vi.fn(async () => bodyOf("x")) as unknown as typeof globalThis.fetch;
    const { out: text } = await run(["workspace", "pull", "docs", "a.md", "--out", out], true);
    expect(JSON.parse(text)).toEqual({
      success: true,
      message: `Pulled 1 file from "docs" into ${out}`,
      files: ["a.md"]
    });
  });

  it("a body that stops mid-stream leaves no file behind, and the error carries a category", async () => {
    fs.mkdirSync(out, { recursive: true });
    const previous = path.join(out, "report.pdf");
    fs.writeFileSync(previous, "the previous good file");
    getFileUrl.mockResolvedValue({ url: "https://s3.invalid/report.pdf" });
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("40 %"));
        controller.error(new TypeError("terminated"));
      }
    });
    globalThis.fetch = vi.fn(
      async () => new Response(broken, { status: 200 })
    ) as unknown as typeof globalThis.fetch;
    const { exitCode, err } = await run(["workspace", "pull", "docs", "report.pdf", "--out", out]);
    expect(exitCode).toBe(7);
    expect(err).toContain("stopped mid-stream");
    expect(fs.readFileSync(previous, "utf8")).toBe("the previous good file");
    expect(fs.existsSync(`${previous}.part`)).toBe(false);
  });

  it("a disk that refuses the write exits local-failed, not connection-failed — the server did nothing wrong", async () => {
    // `--out` exists and cannot be written into: the open of `report.pdf.part`
    // fails inside the same pipeline a dropped body fails in. ENOSPC, EROFS,
    // EACCES are the caller's disk; reported as "connection failed" they read
    // as retryable and send the caller to the network.
    fs.mkdirSync(out, { recursive: true });
    fs.chmodSync(out, 0o500);
    getFileUrl.mockResolvedValue({ url: "https://s3.invalid/report.pdf" });
    globalThis.fetch = vi.fn(async () => bodyOf("bytes")) as unknown as typeof globalThis.fetch;
    try {
      const { exitCode, err } = await run([
        "workspace",
        "pull",
        "docs",
        "report.pdf",
        "--out",
        out
      ]);
      expect(exitCode).toBe(9);
      expect(err).toContain("could not be written");
      expect(err).not.toContain("stopped mid-stream");
    } finally {
      fs.chmodSync(out, 0o700);
    }
  });

  it("a refused run leaves the disk as it found it — --out is not created up front", async () => {
    const target = path.join(out, "never-made");
    list.mockResolvedValue({
      workspaces: [{ id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" }]
    });
    const { exitCode } = await run(["workspace", "pull", "docs", "--out", target, "--shared"]);
    expect(exitCode).not.toBe(0);
    expect(fs.existsSync(target)).toBe(false);
  });

  it("a zip that cannot be removed after a good unpack is a leftover, never a failure", async () => {
    downloadFolderArchive.mockResolvedValue(bodyOf("PK-zip-bytes"));
    const unlink = vi.spyOn(fs, "unlinkSync").mockImplementationOnce(() => {
      throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
    });
    const { exitCode, out: text } = await run(["workspace", "pull", "docs", "--out", out], true);
    unlink.mockRestore();
    expect(exitCode).toBe(0);
    expect(JSON.parse(text)).toMatchObject({ success: true, zip: path.join(out, "docs.zip") });
  });
});

describe("nexus workspace pull — named files fail loud, not partial", () => {
  let out: string;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    out = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-pull-"));
  });
  afterEach(() => {
    setJsonMode(false);
    globalThis.fetch = realFetch;
    fs.rmSync(out, { recursive: true, force: true });
  });

  it("a named file that does not exist refuses the run before any byte of its siblings lands", async () => {
    // Every link is resolved first: the 404 arrives at the link stage, so the
    // good sibling is never even fetched, and --out stays as it was.
    getFileUrl.mockImplementation(async (_slug: string, remotePath: string) => {
      if (remotePath === "missing.md") {
        throw Object.assign(new Error("Not found"), {
          status: 404,
          code: "WORKSPACE_FILE_NOT_FOUND"
        });
      }
      return { url: `https://s3.invalid/${remotePath}` };
    });
    const fetchMock = vi.fn(async () => bodyOf("x"));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    const { exitCode } = await run([
      "workspace",
      "pull",
      "docs",
      "a.md",
      "missing.md",
      "--out",
      out
    ]);
    expect(exitCode).not.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(out, "a.md"))).toBe(false);
  });

  it("a download that fails beside one that lands names the landed file, and nothing lands after the document", async () => {
    getFileUrl.mockImplementation(async (_slug: string, remotePath: string) => ({
      url: `https://s3.invalid/${remotePath}`
    }));
    globalThis.fetch = vi.fn(async (url: string) =>
      url.endsWith("gone.pdf") ? bodyOf("denied", 403) : bodyOf("bytes of a")
    ) as unknown as typeof globalThis.fetch;
    const { exitCode, err } = await run([
      "workspace",
      "pull",
      "docs",
      "a.md",
      "gone.pdf",
      "--out",
      out
    ]);
    expect(exitCode).toBe(6);
    expect(err).toContain("answered HTTP 403");
    expect(err).toContain(`already on disk: ${path.join(out, "a.md")}`);
    expect(fs.readFileSync(path.join(out, "a.md"), "utf8")).toBe("bytes of a");
  });
});

describe("nexus workspace pull — refusals and --shared", () => {
  let out: string;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    out = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-pull-"));
  });
  afterEach(() => {
    setJsonMode(false);
    globalThis.fetch = realFetch;
    fs.rmSync(out, { recursive: true, force: true });
  });

  it("refuses two named files with one base name before fetching anything", async () => {
    const { exitCode, err } = await run([
      "workspace",
      "pull",
      "docs",
      "a/x.md",
      "b/x.md",
      "--out",
      out
    ]);
    expect(getFileUrl).not.toHaveBeenCalled();
    expect(exitCode).toBe(5);
    expect(err).toContain("Two files would land on");
  });

  it("--shared pulls the admin-shared twin by id, and refuses when there is none", async () => {
    list.mockResolvedValue({
      workspaces: [
        { id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" },
        { id: "w-shared", slug: "docs", isShared: true, kind: "DRIVE" }
      ]
    });
    downloadFolderArchive.mockResolvedValue(bodyOf("PK"));
    const ok = await run(["workspace", "pull", "docs", "--out", out, "--shared"]);
    expect(downloadFolderArchive).toHaveBeenCalledWith("docs", {
      path: undefined,
      workspaceId: "w-shared"
    });
    expect(ok.exitCode).toBe(0);

    vi.clearAllMocks();
    list.mockResolvedValue({
      workspaces: [{ id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" }]
    });
    const miss = await run(["workspace", "pull", "docs", "--out", out, "--shared"]);
    expect(downloadFolderArchive).not.toHaveBeenCalled();
    expect(miss.exitCode).toBe(4);
    expect(miss.err).toContain('No admin-shared workspace has the slug "docs"');
  });

  it("--shared carries the twin's id into every file link, so a bare-slug twin cannot answer", async () => {
    list.mockResolvedValue({
      workspaces: [
        { id: "w-org", slug: "docs", isShared: false, kind: "DRIVE" },
        { id: "w-shared", slug: "docs", isShared: true, kind: "DRIVE" }
      ]
    });
    getFileUrl.mockResolvedValue({ url: "https://s3.invalid/x.md" });
    globalThis.fetch = vi.fn(async () => bodyOf("x")) as unknown as typeof globalThis.fetch;
    const { exitCode } = await run(["workspace", "pull", "docs", "x.md", "--out", out, "--shared"]);
    expect(getFileUrl).toHaveBeenCalledWith("docs", "x.md", { workspaceId: "w-shared" });
    expect(exitCode).toBe(0);
  });
});

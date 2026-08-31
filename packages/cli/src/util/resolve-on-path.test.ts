import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  formatResolutionList,
  judgeResolution,
  parseReportedVersion,
  type PathCandidate,
  resolveCandidates,
  resolveOnPath
} from "./resolve-on-path";

/**
 * The PATH lookup `nexus upgrade` verifies against.
 *
 * Every case here runs against REAL files in a temp directory rather than a
 * stubbed filesystem. The whole value of this module is that it agrees with
 * what a shell does, and a mocked `statSync` would only prove it agrees with
 * the mock.
 */

let root: string;
let originalPath: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "resolve-on-path-"));
  originalPath = process.env.PATH;
});

afterEach(() => {
  process.env.PATH = originalPath;
  rmSync(root, { recursive: true, force: true });
});

function dirWith(name: string, entries: Array<{ file: string; executable: boolean }>): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const target = join(dir, entry.file);
    writeFileSync(target, "#!/bin/sh\necho hi\n");
    chmodSync(target, entry.executable ? 0o755 : 0o644);
  }
  return dir;
}

describe("resolveOnPath", () => {
  it("returns every hit in PATH order, not just the winner", () => {
    const first = dirWith("first", [{ file: "nexus", executable: true }]);
    const second = dirWith("second", [{ file: "nexus", executable: true }]);
    const third = dirWith("third", [{ file: "nexus", executable: true }]);

    const found = resolveOnPath("nexus", { PATH: [first, second, third].join(delimiter) });

    expect(found).toEqual([join(first, "nexus"), join(second, "nexus"), join(third, "nexus")]);
  });

  it("skips a non-executable file of the same name, exactly as a shell does", () => {
    const notExecutable = dirWith("plain", [{ file: "nexus", executable: false }]);
    const real = dirWith("real", [{ file: "nexus", executable: true }]);

    const found = resolveOnPath("nexus", { PATH: [notExecutable, real].join(delimiter) });

    // Control: the file IS there and IS named right — only the mode differs.
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(join(real, "nexus"));
  });

  it("skips a directory named like the binary", () => {
    const dir = join(root, "trap");
    mkdirSync(join(dir, "nexus"), { recursive: true });

    expect(resolveOnPath("nexus", { PATH: dir })).toEqual([]);
  });

  it("returns nothing for a missing PATH, an empty PATH, or a missing binary", () => {
    expect(resolveOnPath("nexus", {})).toEqual([]);
    expect(resolveOnPath("nexus", { PATH: "" })).toEqual([]);
    expect(resolveOnPath("nexus", { PATH: join(root, "nowhere") })).toEqual([]);
  });

  it("does not search PATH for a name that already carries a separator", () => {
    // A shell runs `./nexus` and `/usr/bin/nexus` directly. Reporting a PATH hit
    // for one would name a file the caller never invoked.
    const dir = dirWith("bin", [{ file: "nexus", executable: true }]);
    expect(resolveOnPath("./nexus", { PATH: dir })).toEqual([]);
    expect(resolveOnPath("/usr/local/bin/nexus", { PATH: dir })).toEqual([]);
  });

  it("does not report the same file twice for a duplicated PATH entry", () => {
    const dir = dirWith("once", [{ file: "nexus", executable: true }]);
    expect(resolveOnPath("nexus", { PATH: [dir, dir].join(delimiter) })).toHaveLength(1);
  });
});

describe("resolveCandidates", () => {
  it("probes each hit and carries the version it reports", () => {
    const first = dirWith("a", [{ file: "nexus", executable: true }]);
    const second = dirWith("b", [{ file: "nexus", executable: true }]);
    const versions = new Map([
      [join(first, "nexus"), "0.22.4"],
      [join(second, "nexus"), "0.25.0"]
    ]);

    const candidates = resolveCandidates(
      "nexus",
      { PATH: [first, second].join(delimiter) },
      (binary) => ({ version: versions.get(binary) ?? null, failure: null })
    );

    expect(candidates.map((c) => c.version)).toEqual(["0.22.4", "0.25.0"]);
  });

  it("carries a probe failure rather than dropping the entry", () => {
    // A binary that will not start is the loud half of this defect. Silently
    // omitting it would leave the reader with a list that does not contain the
    // file their shell actually runs.
    const dir = dirWith("broken", [{ file: "nexus", executable: true }]);

    const candidates = resolveCandidates("nexus", { PATH: dir }, () => ({
      version: null,
      failure: "Cannot find module '/global/v11/85d5-collected/…/dist/index.js'"
    }));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].version).toBeNull();
    expect(candidates[0].failure).toMatch(/Cannot find module/);
  });

  it("really spawns the resolved binary when no probe is injected", () => {
    // The one case that proves the default probe works end to end. Everything
    // else here injects, and an injected probe cannot fail the way a spawn can.
    const dir = join(root, "spawnable");
    mkdirSync(dir, { recursive: true });
    const binary = join(dir, "nexus");
    writeFileSync(binary, '#!/bin/sh\necho "1.2.3"\n', { mode: 0o755 });
    chmodSync(binary, 0o755);

    const candidates = resolveCandidates("nexus", { PATH: dir });

    expect(candidates).toHaveLength(1);
    // The failure column is asserted FIRST, and carries its own message,
    // because it is the only field that says WHY there is no version. vitest
    // stops at the first failing assertion, so with the version checked first
    // this case reds as `expected null to be "1.2.3"` — a sentence that names
    // neither the module nor the machine, and leaves a reader to guess between
    // "the parse broke" and "this box could not start a process". Checked in
    // this order the red prints the reason verbatim: a spawn abandoned at
    // PROBE_TIMEOUT_MS reads `spawnSync … ETIMEDOUT`, and a parse that stopped
    // recognising a version reads back the output it failed to read.
    expect(candidates[0].failure, "the probe reported a failure instead of a version").toBeNull();
    expect(candidates[0].version).toBe("1.2.3");
  });

  it("stops probing after the sixth hit rather than spawning one process per PATH entry", () => {
    // A PATH with dozens of hits is pathological, and rendering a diagnostic
    // does not need to cost a process per entry. The over-limit row is still
    // PRINTED — omitting it would hide a file the shell can reach — it just
    // carries the reason it was not read in place of a version.
    const dirs = Array.from({ length: 7 }, (_, index) =>
      dirWith(`limit-${index}`, [{ file: "nexus", executable: true }])
    );
    const probed: string[] = [];

    const candidates = resolveCandidates("nexus", { PATH: dirs.join(delimiter) }, (binary) => {
      probed.push(binary);
      return { version: "0.25.0", failure: null };
    });

    // Recording the probe rather than counting rows is the point: the limit is
    // a claim about how many processes get SPAWNED, and a row count is
    // satisfied by an implementation that probes all seven and hides one.
    expect(probed).toEqual(dirs.slice(0, 6).map((dir) => join(dir, "nexus")));
    expect(candidates).toHaveLength(7);
    expect(candidates[6].path).toBe(join(dirs[6], "nexus"));
    expect(candidates[6].version).toBeNull();
    expect(candidates[6].failure).toMatch(/too many entries on PATH/);
  });
});

describe("parseReportedVersion", () => {
  it("reads a bare version, and one surrounded by other output", () => {
    expect(parseReportedVersion("0.25.0\n")).toBe("0.25.0");
    expect(parseReportedVersion("nexus 0.25.0 (build 7)\n")).toBe("0.25.0");
    expect(parseReportedVersion("1.0.0-beta.3\n")).toBe("1.0.0-beta.3");
  });

  it("returns null when there is no version to read", () => {
    expect(parseReportedVersion("")).toBeNull();
    expect(parseReportedVersion("command not found\n")).toBeNull();
    // Two components is not a version — accepting it would let `node 24.9`
    // masquerade as an answer.
    expect(parseReportedVersion("24.9\n")).toBeNull();
  });
});

describe("judgeResolution", () => {
  const at = (version: string | null, failure: string | null = null): PathCandidate => ({
    path: "/usr/local/bin/nexus",
    version,
    failure
  });

  it("verifies when the first hit matches the installed version", () => {
    expect(judgeResolution("0.25.0", [at("0.25.0")])).toMatchObject({ kind: "verified" });
  });

  it("verifies when the first hit is NEWER than the installed version", () => {
    // A pre-release build is a correct machine, not a shadowed one.
    expect(judgeResolution("0.25.0", [at("0.26.0")])).toMatchObject({ kind: "verified" });
  });

  it("is shadowed when the first hit is older, EVEN IF a newer one follows", () => {
    // The newer copy in position two is the bug, never a mitigation of it: a
    // shell will never reach it.
    const verdict = judgeResolution("0.25.0", [
      { path: "/old/nexus", version: "0.22.4", failure: null },
      { path: "/new/nexus", version: "0.25.0", failure: null }
    ]);

    expect(verdict).toEqual({ kind: "shadowed", binary: "/old/nexus", version: "0.22.4" });
  });

  it("is unreadable when the first hit will not report a version", () => {
    expect(judgeResolution("0.25.0", [at(null, "MODULE_NOT_FOUND")])).toEqual({
      kind: "unreadable",
      binary: "/usr/local/bin/nexus",
      failure: "MODULE_NOT_FOUND"
    });
  });

  it("is unresolved when nothing is on PATH", () => {
    expect(judgeResolution("0.25.0", [])).toEqual({ kind: "unresolved" });
  });
});

describe("formatResolutionList", () => {
  it("marks the entry the shell runs, and prints the ones it does not", () => {
    const lines = formatResolutionList([
      { path: "/home/a/.nvm/bin/nexus", version: "0.22.4", failure: null },
      { path: "/home/a/Library/pnpm/nexus", version: "0.25.0", failure: null }
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /→ \/home\/a\/\.nvm\/bin\/nexus\s+0\.22\.4\s+← your shell runs this one/
    );
    // The second row carries no arrow and no claim — it is context, not the answer.
    expect(lines[1]).toContain("/home/a/Library/pnpm/nexus");
    expect(lines[1]).not.toContain("→");
  });

  it("returns ONE LINE PER ENTRY, never a string carrying newlines", () => {
    // The caller joins with an indent, and an embedded newline skips it —
    // which un-aligns exactly the column that IS the diagnostic. Measured
    // before this changed: row two lost two spaces and no test noticed.
    const lines = formatResolutionList([
      { path: "/a/nexus", version: "1.0.0", failure: null },
      { path: "/b/nexus", version: "2.0.0", failure: null }
    ]);

    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).not.toContain("\n");
  });

  it("aligns the version column across rows of different path lengths", () => {
    const lines = formatResolutionList([
      { path: "/short/nexus", version: "1.0.0", failure: null },
      { path: "/a/considerably/longer/path/to/nexus", version: "2.0.0", failure: null }
    ]);

    expect(lines[0].indexOf("1.0.0")).toBe(lines[1].indexOf("2.0.0"));
  });

  it("renders a failed probe in place of a version rather than blanking the row", () => {
    const lines = formatResolutionList([
      { path: "/broken/nexus", version: null, failure: "MODULE_NOT_FOUND" }
    ]);

    expect(lines[0]).toContain("/broken/nexus");
    expect(lines[0]).toContain("MODULE_NOT_FOUND");
  });

  it("elides a long failure so one bad row cannot destroy the column", () => {
    const lines = formatResolutionList([
      {
        path: "/broken/nexus",
        version: null,
        failure:
          "Cannot find module '/Users/nab/Library/pnpm/global/v11/85d5-a1/node_modules/@agent-nexus/cli/dist/index.js'\n    at Module._resolveFilename"
      },
      { path: "/fine/nexus", version: "0.25.0", failure: null }
    ]);

    expect(lines[0]).toContain("…");
    expect(lines[0]).not.toContain("Module._resolveFilename");
    // Control: the row still says WHAT went wrong, it is only shorter.
    expect(lines[0]).toContain("Cannot find module");
    expect(lines[0].length).toBeLessThan(120);
  });
});

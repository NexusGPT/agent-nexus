import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isStarterVersionSpec } from "./apps/starter/is-starter-version-spec";
import { judgeTargetDirectory } from "./apps/starter/judge-target-directory";

describe("judgeTargetDirectory", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "starter-target-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("creates a directory that does not exist", () => {
    expect(judgeTargetDirectory(join(root, "new-app"))).toEqual({ ok: true, create: true });
  });

  it("uses an existing empty directory without creating it", () => {
    const dir = join(root, "empty");
    mkdirSync(dir);

    expect(judgeTargetDirectory(dir)).toEqual({ ok: true, create: false });
  });

  it("refuses a non-empty directory", () => {
    const dir = join(root, "busy");
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), "{}");

    expect(judgeTargetDirectory(dir).ok).toBe(false);
  });

  it("refuses a path that is a file", () => {
    const file = join(root, "a-file");
    writeFileSync(file, "x");

    expect(judgeTargetDirectory(file).ok).toBe(false);
  });
});

describe("isStarterVersionSpec", () => {
  it.each(["latest", "0.3.1", "1.0.0-rc.1"])("accepts %s", (spec) => {
    expect(isStarterVersionSpec(spec)).toBe(true);
  });

  it.each(["^0.3.0", "0.3", "v0.3.1", "next", "../../x", "0.3.1 || 0.4.0"])(
    "refuses %s",
    (spec) => {
      expect(isStarterVersionSpec(spec)).toBe(false);
    }
  );
});

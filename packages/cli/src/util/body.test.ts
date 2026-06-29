import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { resolveInputJson } from "./body";

describe("resolveInputJson (NEX-2480)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nex-2480-"));

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns undefined when the flag is not provided", async () => {
    await expect(resolveInputJson(undefined)).resolves.toBeUndefined();
  });

  it("parses inline JSON", async () => {
    await expect(resolveInputJson('{"title":"My Sheet"}')).resolves.toEqual({
      title: "My Sheet"
    });
  });

  it("reads and parses a file path (the reported bug)", async () => {
    const file = path.join(dir, "input.json");
    writeFileSync(file, '{\n  "to": "a@b.com",\n  "subject": "Hi"\n}\n');
    await expect(resolveInputJson(file)).resolves.toEqual({
      to: "a@b.com",
      subject: "Hi"
    });
  });

  it("reads a file path that does not end in .json", async () => {
    const file = path.join(dir, "payload");
    writeFileSync(file, '{"ok":true}');
    await expect(resolveInputJson(file)).resolves.toEqual({ ok: true });
  });

  it("throws a clear error for invalid inline JSON", async () => {
    await expect(resolveInputJson("not json")).rejects.toThrow(/Invalid JSON in --input/);
  });

  it("uses the provided flag name in error messages", async () => {
    await expect(resolveInputJson("nope", "--data")).rejects.toThrow(/Invalid JSON in --data/);
  });
});

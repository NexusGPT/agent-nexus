import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readString, readStringField, resolveInputJson } from "./body";

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

describe("readString", () => {
  it("keeps a non-empty string", () => {
    expect(readString("GOOGLE_SHEETS")).toBe("GOOGLE_SHEETS");
  });

  it("treats an empty string as absent, so the caller falls through to its next source", () => {
    // `--service ""` supplies no service. Returning `""` here would put it on
    // the wire for the server to reject with a field the operator never typed.
    expect(readString("")).toBeUndefined();
  });

  it("refuses anything that is not a string", () => {
    // Commander types `opts` as `any` and `--body` arrives as `unknown` values,
    // so both reach a command with the check switched off.
    expect(readString(undefined)).toBeUndefined();
    expect(readString(null)).toBeUndefined();
    expect(readString(7)).toBeUndefined();
    expect(readString(true)).toBeUndefined();
    expect(readString({ toString: () => "nope" })).toBeUndefined();
    expect(readString(["a"])).toBeUndefined();
  });
});

describe("readStringField", () => {
  const body = { authType: "http", service: "NOTION" };

  it("prefers the flag", () => {
    expect(readStringField("GMAIL", body, "service")).toBe("GMAIL");
  });

  it("falls back to the body field when no flag was passed", () => {
    expect(readStringField(undefined, body, "service")).toBe("NOTION");
  });

  it("falls back when the flag is present but empty", () => {
    expect(readStringField("", body, "service")).toBe("NOTION");
  });

  it("returns undefined when neither source supplied it", () => {
    expect(readStringField(undefined, body, "name")).toBeUndefined();
    expect(readStringField(undefined, undefined, "service")).toBeUndefined();
  });

  it("ignores a body field of the wrong type rather than forwarding it", () => {
    expect(readStringField(undefined, { service: 42 }, "service")).toBeUndefined();
  });
});

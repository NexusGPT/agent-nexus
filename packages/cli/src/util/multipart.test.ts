import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveBody } from "./body";
import { buildMultipartBody, MULTIPART_FILE_FIELD } from "./multipart";

/**
 * `nexus api --file` is the only CLI route to the Public API v1 upload
 * endpoints that have no typed command — the evaluation dataset upload among
 * them. Everything worth getting wrong here is invisible to `tsc`: the field
 * name multer accepts, and whether the file's NAME travels with its bytes.
 *
 * The name is the sharp one. `POST /skills/tasks/:taskId/evaluations/
 * :sessionId/dataset` chooses between its JSON and CSV parsers by testing the
 * name for a `.json` suffix and reads no media type, so a body sent nameless is
 * not rejected — it is parsed as CSV, and a JSON document parsed as CSV stores
 * garbage rows without erroring.
 */

let workingDirectory: string;
let datasetPath: string;

beforeAll(() => {
  workingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "nexus-cli-multipart-"));
  datasetPath = path.join(workingDirectory, "cases.json");
  fs.writeFileSync(datasetPath, '[{"input":"hello"}]');
});

afterAll(() => {
  fs.rmSync(workingDirectory, { recursive: true, force: true });
});

describe("buildMultipartBody", () => {
  it("sends the file under the field name every v1 upload route reads", () => {
    const part = buildMultipartBody(datasetPath, undefined).get(MULTIPART_FILE_FIELD);

    expect(part).toBeInstanceOf(File);
    // The control. `get` returning a value for the declared name proves nothing
    // unless it returns null for a name that was never sent.
    expect(buildMultipartBody(datasetPath, undefined).get("upload")).toBeNull();
  });

  it("sends the file's base name, which is what selects a parser server-side", async () => {
    const part = buildMultipartBody(datasetPath, undefined).get(MULTIPART_FILE_FIELD);

    expect(part instanceof File ? part.name : undefined).toBe("cases.json");
    expect(part instanceof File ? await part.text() : undefined).toBe('[{"input":"hello"}]');
  });

  it("carries --body's keys as text parts beside the file", () => {
    const form = buildMultipartBody(datasetPath, { description: "Q4 report" });

    expect(form.get("description")).toBe("Q4 report");
    expect(form.get(MULTIPART_FILE_FIELD)).toBeInstanceOf(File);
  });

  it("JSON-encodes a non-string field, which is how /documents/file reads metadata", () => {
    const form = buildMultipartBody(datasetPath, { metadata: { language: "fr" } });

    expect(form.get("metadata")).toBe('{"language":"fr"}');
  });

  it("refuses a --body key that would collide with the file part", () => {
    expect(() => buildMultipartBody(datasetPath, { [MULTIPART_FILE_FIELD]: "x" })).toThrow(
      /cannot carry a "file" key/
    );
  });

  /**
   * `resolveBody` casts a bare `JSON.parse`, so EVERY JSON value reaches here
   * wearing the object type — not just the array this list started with.
   *
   * Each case asserts the FULL intended sentence, never "it throws". `null` used
   * to reach `Object.entries` and die with `TypeError: Cannot convert undefined
   * or null to object`, which also throws — a test asserting only that something
   * was thrown passes on the broken code and proves nothing. The message is the
   * assertion.
   */
  it.each([
    ["null", "null"],
    ["true", "true"],
    ["false", "false"],
    ["a number", "42"],
    ["zero", "0"],
    ["a string", '"a string"'],
    ["an empty array", "[]"],
    ["an array of objects", '[{"a":1}]']
  ])("refuses a --body that is %s, by the intended message", (_label, json: string) => {
    expect(() => buildMultipartBody(datasetPath, JSON.parse(json))).toThrow(
      "--body must be a JSON object when --file is used."
    );
  });

  it("names the resolved path when the file does not exist", () => {
    const missing = path.join(workingDirectory, "absent.csv");

    expect(() => buildMultipartBody(missing, undefined)).toThrow(`File not found: ${missing}`);
  });
});

/**
 * The finding that produced the case above named TWO entry points — `--body
 * null` on the command line and a `.json` FILE containing `null`. There is a
 * third, `--body -`. All three are `resolveBody`'s problem, not this module's,
 * and this block proves they converge on one value rather than assuming they do
 * from reading `resolveRequiredBody`.
 */
describe("every --body entry point converges on the same parsed value", () => {
  it("produces null from an inline literal, a .json file, and stdin alike", async () => {
    const nullFile = path.join(workingDirectory, "empty-body.json");
    fs.writeFileSync(nullFile, "null");

    expect(await resolveBody("null")).toBeNull();
    expect(await resolveBody(nullFile)).toBeNull();

    const realStdin = Object.getOwnPropertyDescriptor(process, "stdin");
    try {
      Object.defineProperty(process, "stdin", {
        value: Readable.from([Buffer.from("null")]),
        configurable: true
      });
      expect(await resolveBody("-")).toBeNull();
    } finally {
      if (realStdin) Object.defineProperty(process, "stdin", realStdin);
    }
  });

  /**
   * The control. Without it the three assertions above are satisfied by a
   * `resolveBody` that returns `null` for everything, which is exactly the
   * failure they are meant to detect.
   */
  it("still returns an object for a real object, through the same three paths", async () => {
    const objectFile = path.join(workingDirectory, "real-body.json");
    fs.writeFileSync(objectFile, '{"description":"Q4"}');

    expect(await resolveBody('{"description":"Q4"}')).toEqual({ description: "Q4" });
    expect(await resolveBody(objectFile)).toEqual({ description: "Q4" });
  });

  it("hands each of those nulls to buildMultipartBody and gets the intended error", async () => {
    const nullFile = path.join(workingDirectory, "empty-body.json");
    fs.writeFileSync(nullFile, "null");

    for (const raw of ["null", nullFile]) {
      const parsed = await resolveBody(raw);
      expect(() => buildMultipartBody(datasetPath, parsed)).toThrow(
        "--body must be a JSON object when --file is used."
      );
    }
  });
});

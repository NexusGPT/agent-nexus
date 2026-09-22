import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  CLEAR_TOKEN,
  readClearableFlag,
  readString,
  readStringField,
  resetResolvedBodies,
  resolveInputJson,
  resolveRequiredBody
} from "./body";

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

describe("the resolved-body memo, and the one caller that must clear it", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "nex-3714-"));

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("answers the SECOND read from the first, so a check and a request agree", async () => {
    const file = path.join(dir, "b.json");
    writeFileSync(file, JSON.stringify({ name: "first" }));

    expect(await resolveRequiredBody(file)).toEqual({ name: "first" });
    writeFileSync(file, JSON.stringify({ name: "second" }));
    expect(await resolveRequiredBody(file)).toEqual({ name: "first" });
  });

  it("forgets on request, so one process can resolve the same key twice", async () => {
    // The CLI never needs this: it resolves one command and exits. The `--help`
    // example scanner parses every example in the package in ONE process, and
    // the key for every piped body in it is the identical `"-"` — so without the
    // reset the first document read would answer for all of them, and an example
    // would be judged against another example's bytes.
    const file = path.join(dir, "c.json");
    writeFileSync(file, JSON.stringify({ name: "first" }));
    expect(await resolveRequiredBody(file)).toEqual({ name: "first" });

    resetResolvedBodies();
    writeFileSync(file, JSON.stringify({ name: "second" }));
    expect(await resolveRequiredBody(file)).toEqual({ name: "second" });
  });
});

describe("readClearableFlag", () => {
  it("reads the clear token as a wire null, which is the whole reason it exists", () => {
    // A PATCH leaves an omitted field alone, so absence already means "don't
    // touch this". Clearing a nullable field is a SECOND thing to say, and
    // absence cannot say both — this token is what says the second.
    expect(readClearableFlag(CLEAR_TOKEN)).toBeNull();
  });

  it("passes every other value through untouched", () => {
    expect(readClearableFlag("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(readClearableFlag("Renamed Folder")).toBe("Renamed Folder");
  });

  it('does NOT read "none" as a clear — that vocabulary belongs to the role commands', () => {
    // `role/_shared/read-nullable-string.ts` accepts "none" as well, because its
    // fields are things like a currency code where "none" cannot be a real
    // value. The fields THIS helper serves include free text: `nexus deployment
    // update --description none` must set the description to the string "none",
    // because that is a description somebody can legitimately want. Widening
    // this helper to match role's vocabulary would silently blank it.
    expect(readClearableFlag("none")).toBe("none");
  });

  it("is case-sensitive and does not trim, so only the exact token clears", () => {
    // Anything looser makes a real value unsendable: these are all legitimate
    // strings a field could hold, and none of them is the operator asking to
    // clear anything.
    expect(readClearableFlag("NULL")).toBe("NULL");
    expect(readClearableFlag("Null")).toBe("Null");
    expect(readClearableFlag(" null")).toBe(" null");
    expect(readClearableFlag("null ")).toBe("null ");
  });

  it("leaves the empty string alone — it is not a clear", () => {
    // `readString` collapses "" to undefined so a `??` chain falls through.
    // This helper is a different decision and must not borrow that one: the
    // caller has already decided the flag was supplied.
    expect(readClearableFlag("")).toBe("");
  });
});

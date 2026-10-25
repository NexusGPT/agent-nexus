import { describe, expect, it } from "vitest";

import { errnoOf } from "./errno-of";

describe("errnoOf", () => {
  it("returns the errno string a Node system error carries", () => {
    const error = Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
    expect(errnoOf(error)).toBe("EPERM");
  });

  it("reads the code off any object, not only an Error: a rethrown plain object still names its errno", () => {
    expect(errnoOf({ code: "EEXIST" })).toBe("EEXIST");
  });

  it.each([
    ["an Error with no code", new Error("boom")],
    [
      "a numeric code (an HTTP-style status is not an errno)",
      Object.assign(new Error(), { code: 1 })
    ],
    ["a thrown string", "EPERM"],
    ["null", null],
    ["undefined", undefined]
  ])("is undefined for %s", (_label, thrown) => {
    expect(errnoOf(thrown)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";

import { CategorizedCliError } from "../exit-codes";
import { METADATA_KEY_RULE, parseFilterPairs, parseMetadataPairs } from "./metadata";

describe("the key rule, applied by both parsers", () => {
  it("accepts letters, digits, - and _ after the first character", () => {
    expect(() => parseMetadataPairs(["a-b=x", "language=fr", "content_type=faq"])).not.toThrow();
    expect(() => parseFilterPairs(["a-b=x", "content_type=faq"])).not.toThrow();
  });

  it("accepts a key of exactly 64 characters", () => {
    expect(() => parseMetadataPairs([`${"k".repeat(64)}=x`])).not.toThrow();
  });

  it("refuses a key starting with _, naming it and the rule", () => {
    expect(() => parseMetadataPairs(["language=fr", "_priority=high"])).toThrow(
      `Metadata key "_priority" is refused: ${METADATA_KEY_RULE}.`
    );
    expect(() => parseFilterPairs(["_priority=high"])).toThrow(
      `Metadata key "_priority" is refused: ${METADATA_KEY_RULE}.`
    );
  });

  it("refuses a key of 65 characters, naming it", () => {
    const tooLong = "k".repeat(65);
    expect(() => parseMetadataPairs([`${tooLong}=x`])).toThrow(`Metadata key "${tooLong}"`);
  });

  it("refuses as invalid input, so the exit code says the caller's input is wrong", () => {
    let thrown: unknown;
    try {
      parseMetadataPairs(["_priority=high"]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CategorizedCliError);
    expect(thrown).toMatchObject({ category: "invalid-input" });
  });
});

describe("parseMetadataPairs", () => {
  it("parses key=value pairs and trims", () => {
    expect(parseMetadataPairs(["language=fr", " content_type = faq "])).toEqual({
      language: "fr",
      content_type: "faq"
    });
  });

  it("treats a bare key as empty string", () => {
    expect(parseMetadataPairs(["draft"])).toEqual({ draft: "" });
    // Trimmed like a `key=value` key and like `--filter`'s bare key.
    expect(parseMetadataPairs([" draft "])).toEqual({ draft: "" });
  });

  it("keeps '=' inside the value", () => {
    expect(parseMetadataPairs(["filter=a=b"])).toEqual({ filter: "a=b" });
  });

  it("keeps __proto__ as an own key, so the key rule refuses it instead of sending {}", () => {
    expect(() => parseMetadataPairs(["__proto__=high"])).toThrow(
      'Metadata key "__proto__" is refused'
    );
  });
});

describe("parseFilterPairs", () => {
  it("keeps a single occurrence scalar", () => {
    expect(parseFilterPairs(["language=fr"])).toEqual({ language: "fr" });
  });

  it("groups a repeated key into an array", () => {
    expect(parseFilterPairs(["region=eu", "region=us"])).toEqual({ region: ["eu", "us"] });
  });

  it("mixes scalar and array keys, trimming both", () => {
    expect(parseFilterPairs([" language = fr ", "region=eu", "region=us"])).toEqual({
      language: "fr",
      region: ["eu", "us"]
    });
  });

  it("keeps __proto__ as an own key, so the key rule refuses it instead of sending {}", () => {
    expect(() => parseFilterPairs(["__proto__=high"])).toThrow(
      'Metadata key "__proto__" is refused'
    );
  });
});

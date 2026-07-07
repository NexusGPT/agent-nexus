import { describe, expect, it } from "vitest";

import { parseFilterPairs, parseMetadataPairs } from "./metadata";

describe("parseMetadataPairs", () => {
  it("parses key=value pairs and trims", () => {
    expect(parseMetadataPairs(["language=fr", " content_type = faq "])).toEqual({
      language: "fr",
      content_type: "faq"
    });
  });

  it("treats a bare key as empty string", () => {
    expect(parseMetadataPairs(["draft"])).toEqual({ draft: "" });
  });

  it("keeps '=' inside the value", () => {
    expect(parseMetadataPairs(["filter=a=b"])).toEqual({ filter: "a=b" });
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
});

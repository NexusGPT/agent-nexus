import { describe, expect, it } from "vitest";

import {
  DOCUMENT_METADATA_KEY_PATTERN,
  DOCUMENT_METADATA_KEY_RULE
} from "./document-metadata-key-rule.conformance";
import { METADATA_KEY_PATTERN, METADATA_KEY_RULE } from "./util/metadata";

/**
 * The CLI refuses a metadata key before sending it, with its own copy of the
 * API's rule. A copy that drifts either refuses a key the API accepts or sends
 * a key the API refuses, so the copy is held equal to the contract here.
 */
describe("the CLI's metadata key rule is the contract's rule", () => {
  it("uses the same pattern source and flags", () => {
    expect({ source: METADATA_KEY_PATTERN.source, flags: METADATA_KEY_PATTERN.flags }).toEqual({
      source: DOCUMENT_METADATA_KEY_PATTERN.source,
      flags: DOCUMENT_METADATA_KEY_PATTERN.flags
    });
  });

  it("prints the same rule text", () => {
    expect(METADATA_KEY_RULE).toBe(DOCUMENT_METADATA_KEY_RULE);
  });
});

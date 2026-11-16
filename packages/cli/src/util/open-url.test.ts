import { describe, expect, it } from "vitest";

import { openCommand } from "./open-url";

describe("openCommand", () => {
  it("gives Windows an empty window title, so the address is opened and not used as a title", () => {
    expect(openCommand("win32", "https://example.test/keys?a=1&b=2")).toBe(
      'start "" "https://example.test/keys?a=1&b=2"'
    );
  });
});

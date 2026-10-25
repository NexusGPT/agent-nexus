import { describe, expect, it } from "vitest";

import { WINFSP_PIN, winFspMsiName, winFspMsiUrl } from "./winfsp-pin";

describe("WINFSP_PIN — one signed MSI, by version and by hash", () => {
  it("names the vendor's release asset for the pinned version, and nothing else", () => {
    expect(winFspMsiName()).toBe("winfsp-2.1.25156.msi");
    expect(winFspMsiUrl()).toBe(
      "https://github.com/winfsp/winfsp/releases/download/v2.1/winfsp-2.1.25156.msi"
    );
  });

  it("carries a full sha256, so a download is refused before anything is written", () => {
    expect(WINFSP_PIN.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { openUrl } from "../../util/open-url";
import { resolveApiKey } from "./login.resolve-key";
import { SETTINGS_URL } from "./login.settings-url";

vi.mock("../../util/open-url", () => ({ openUrl: vi.fn() }));

const realStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");

function setStdinIsTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

describe("resolveApiKey — the keys page opens only for a person at a terminal", () => {
  afterEach(() => {
    if (realStdinIsTty) Object.defineProperty(process.stdin, "isTTY", realStdinIsTty);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    vi.mocked(openUrl).mockClear();
    vi.restoreAllMocks();
  });

  it("opens the page when the key is typed at a terminal", async () => {
    setStdinIsTty(true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const key = await resolveApiKey(() => Promise.resolve("nxs_typed"), undefined);

    expect(key?.apiKey).toBe("nxs_typed");
    expect(openUrl).toHaveBeenCalledWith(SETTINGS_URL);
  });

  it("opens nothing and prints the address when a program answers the prompt", async () => {
    setStdinIsTty(false);
    const printed = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const key = await resolveApiKey(() => Promise.resolve("nxs_piped"), undefined);

    expect(key?.apiKey).toBe("nxs_piped");
    expect(openUrl).not.toHaveBeenCalled();
    expect(printed.mock.calls.flat().join("\n")).toContain(SETTINGS_URL);
  });
});

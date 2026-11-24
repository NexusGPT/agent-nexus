import { afterEach, describe, expect, it, vi } from "vitest";

import { openUrl } from "../../util/open-url";
import { resolveApiKey } from "./login.resolve-key";
import { SETTINGS_URL } from "./login.settings-url";

vi.mock("../../util/open-url", () => ({ openUrl: vi.fn() }));

const realStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const realStderrIsTty = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");

function setStdinIsTty(value: boolean): void {
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
}

/**
 * 🔴 "AT A TERMINAL" IS NOW TWO FLAGS, AND SETTING ONLY STDIN MADE THIS FILE
 * DEPEND ON THE RUNNER.
 *
 * `resolveApiKey` refuses through `askWouldHang()`, which reads stdin AND the
 * prompt stream — so a case that sets `stdin.isTTY = true` and leaves the outputs
 * alone is asking about whatever TTY flags the runner happens to have. On a
 * developer's terminal both outputs are TTYs and the keyboard case passes; in CI,
 * and under any redirected run, neither is, so `askWouldHang()` is true and
 * `resolveApiKey` throws the unseeable-question refusal instead of opening the
 * page. Green here, red there, with nothing in the file naming the dependency.
 *
 * So a person at a terminal is modelled as BOTH: a keyboard on stdin, and a
 * stream that can carry the question. stderr is the one `promptStream()` returns
 * whenever stdout is not a TTY, which is what a `> out.log` run looks like.
 *
 * ⚠️ The docblock below still holds — this file does not assert WHICH stream the
 * address lands on. It now fixes only whether a person could read it at all,
 * which is the precondition the browser decision sits behind.
 */
function setStderrIsTty(value: boolean): void {
  Object.defineProperty(process.stderr, "isTTY", { value, configurable: true });
}

/**
 * Capture what a PERSON would see, on either stream.
 *
 * ⚠️ NOT `console.log`, and that is the whole reason this helper exists. The
 * settings address is preamble to `Paste your API key (nxs_...):` — unanswerable
 * without the page the key comes from — so it goes through `promptLine`, which
 * writes to `promptStream()`. A `console.log` spy captured nothing and this
 * file's second case went red naming the URL, on a change that still prints it.
 *
 * WHICH of the two streams it lands on is deliberately not asserted here:
 * `promptStream()` picks by the runner's own TTY flags, and
 * `login-prompts-are-never-invisible.test.ts` pins that choice with the flags
 * set explicitly. This file's property is the BROWSER decision — open the page
 * for a person, print the address for a program — so it asks only that a person
 * can read the address at all.
 */
function captureHumanOutput(): { text: () => string } {
  const chunks: string[] = [];
  const record = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(record);
  vi.spyOn(process.stderr, "write").mockImplementation(record);
  return { text: (): string => chunks.join("") };
}

describe("resolveApiKey — the keys page opens only for a person at a terminal", () => {
  afterEach(() => {
    if (realStdinIsTty) Object.defineProperty(process.stdin, "isTTY", realStdinIsTty);
    else Reflect.deleteProperty(process.stdin, "isTTY");
    if (realStderrIsTty) Object.defineProperty(process.stderr, "isTTY", realStderrIsTty);
    else Reflect.deleteProperty(process.stderr, "isTTY");
    vi.mocked(openUrl).mockClear();
    vi.restoreAllMocks();
  });

  it("opens the page when the key is typed at a terminal", async () => {
    setStdinIsTty(true);
    // BOTH flags, or this case asks the runner rather than the code — see
    // `setStderrIsTty`. Without it the gate refuses in CI and `openUrl` is
    // never reached, on a change that is working correctly.
    setStderrIsTty(true);
    captureHumanOutput();

    const key = await resolveApiKey(() => Promise.resolve("nxs_typed"), undefined);

    expect(key?.apiKey).toBe("nxs_typed");
    expect(openUrl).toHaveBeenCalledWith(SETTINGS_URL);
  });

  it("opens nothing and prints the address when a program answers the prompt", async () => {
    setStdinIsTty(false);
    // Pinned too, so neither case asks the runner. A piped program redirects
    // both outputs, and `askWouldHang()` is false whatever they are once stdin
    // is not a keyboard — which is the shipped mode this case exists for.
    setStderrIsTty(false);
    const shown = captureHumanOutput();

    const key = await resolveApiKey(() => Promise.resolve("nxs_piped"), undefined);

    expect(key?.apiKey).toBe("nxs_piped");
    expect(openUrl).not.toHaveBeenCalled();
    expect(shown.text()).toContain(SETTINGS_URL);
  });
});

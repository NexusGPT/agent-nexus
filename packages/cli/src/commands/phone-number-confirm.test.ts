import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `phone-number buy` and `phone-number release` must not fire unconfirmed.
 *
 * These are the only two commands in the namespace that move money and cannot
 * be undone — a purchase bills monthly from the moment it returns, a release
 * hands the number back to a pool it cannot be recovered from — and until now
 * they were also the only mutating ones with no confirmation at all, while
 * `workspace delete`, `deployment delete` and `whatsapp-template delete` all
 * gate on `--yes`.
 *
 * The assertion that matters is the NON-TTY one. A prompt that is skipped when
 * stdin is not a terminal is not a gate: every CI job, pipe and script would
 * sail straight through it, which is exactly the caller these two commands are
 * most dangerous for. So the no-TTY case must REFUSE, the way `workspace
 * delete` does, rather than proceed silently the way `deployment delete` does.
 */
const buy = vi.fn();
const release = vi.fn();

vi.mock("../client", () => ({
  createClient: () => ({ phoneNumbers: { buy, release } })
}));

import { EXIT_CODES } from "../exit-codes";
import { registerPhoneNumberCommands } from "./phone-number";

async function run(argv: string[]): Promise<typeof process.exitCode> {
  const program = new Command();
  program.name("nexus").exitOverride();
  registerPhoneNumberCommands(program);
  setJsonMode(true);

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const prevExit = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
  } catch {
    /* commander exitOverride throws on a usage error — assert via exitCode */
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
  const exitCode = process.exitCode;
  process.exitCode = prevExit;
  return exitCode;
}

const BUY_ARGS = [
  "phone-number",
  "buy",
  "--phone-number",
  "+12025551234",
  "--country",
  "US",
  "--price",
  "1.15"
];
const NUMBER_ID = "11111111-1111-1111-1111-111111111111";

describe("phone-number buy/release confirmation", () => {
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    buy.mockResolvedValue({ id: NUMBER_ID, number: "+12025551234" });
    release.mockResolvedValue(undefined);
    originalIsTTY = process.stdin.isTTY;
    // Piped stdin — a CI job, a script, anything that is not a terminal.
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      configurable: true
    });
    setJsonMode(false);
  });

  it("refuses to buy without --yes when stdin is not a terminal", async () => {
    const exitCode = await run(BUY_ARGS);

    expect(buy).not.toHaveBeenCalled();
    expect(exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("buys when --yes is passed", async () => {
    await run([...BUY_ARGS, "--yes"]);

    expect(buy).toHaveBeenCalledWith({
      phoneNumber: "+12025551234",
      country: "US",
      price: "1.15",
      connectionId: undefined
    });
  });

  it("refuses to release without --yes when stdin is not a terminal", async () => {
    const exitCode = await run(["phone-number", "release", NUMBER_ID]);

    expect(release).not.toHaveBeenCalled();
    expect(exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("releases when --yes is passed", async () => {
    await run(["phone-number", "release", NUMBER_ID, "--yes"]);

    expect(release).toHaveBeenCalledWith(NUMBER_ID);
  });
});

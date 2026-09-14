import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { resolveCorpusForCommand } from "./command";
import type { PlatformIo } from "./platform";

const neverCalled: PlatformIo = {
  baseUrl: "https://api.test.example",
  cliVersion: "1.5.0",
  fetch: async () => {
    throw new Error("the refusal must come before any network call");
  },
  globals: {}
};

describe("resolveCorpusForCommand refuses a contradictory or unusable choice", () => {
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    exitCode = process.exitCode;
    setJsonMode(true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.exitCode = exitCode;
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it("refuses --bundled together with --skills-ref", async () => {
    const resolved = await resolveCorpusForCommand(
      { bundled: true, skillsRef: "a".repeat(40) },
      neverCalled
    );
    expect(resolved).toBeNull();
    expect(process.exitCode).not.toBe(0);
  });

  it("refuses an abbreviated --skills-ref rather than guessing which commit it means", async () => {
    const resolved = await resolveCorpusForCommand({ skillsRef: "416b5739" }, neverCalled);
    expect(resolved).toBeNull();
    expect(process.exitCode).not.toBe(0);
  });

  it("reports a pinned commit the platform cannot serve, instead of installing another", async () => {
    const offline: PlatformIo = {
      ...neverCalled,
      fetch: async () => {
        throw new TypeError("fetch failed");
      }
    };
    const resolved = await resolveCorpusForCommand({ skillsRef: "a".repeat(40) }, offline);
    expect(resolved).toBeNull();
    expect(process.exitCode).not.toBe(0);
  });
});

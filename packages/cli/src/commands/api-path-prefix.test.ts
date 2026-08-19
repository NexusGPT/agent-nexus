import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `nexus api` PREPENDS `/api/public/v1`, so a caller who pastes a full path
 * sends it twice.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A LOCAL REFUSAL AND NOT A SENTENCE IN `--help`
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The double-prefixed request is well-formed, reaches the server, and comes
 * back 404 — and a 404 from this command is indistinguishable from "that route
 * does not exist at this version". So the caller's next move is to conclude the
 * platform lacks the capability, which is the one mistake `nexus api --help`
 * already spends a paragraph warning about. The failure teaches the wrong
 * lesson, confidently.
 *
 * A sentence in `--help` is read by whoever opens `--help`. The refusal is read
 * by whoever makes the mistake, which is not the same set of people.
 *
 * ── THE CONTROL IS THE HALF THAT MATTERS ────────────────────────────────────
 *
 * A refusal that fires on every path would satisfy every case below except the
 * last two. `/models` must still reach the network, and `/videos` must not be
 * read as `/v1` plus `deos` — a prefix test without a segment boundary passes
 * every "it refuses" case and breaks a real route.
 */
vi.mock("../config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config")>();
  return {
    ...actual,
    resolveBaseUrl: () => "https://api.nexusgpt.io",
    resolveApiKey: () => "nxs_test"
  };
});

import { EXIT_CODES } from "../exit-codes";
import { registerApiCommand } from "./api";

interface Run {
  readonly stdout: string;
  readonly exitCode: number | undefined;
  readonly requestedUrl: string | undefined;
}

async function runApi(argv: string[]): Promise<Run> {
  const program = new Command();
  program.name("nexus");
  registerApiCommand(program);

  let requestedUrl: string | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      requestedUrl = String(input);
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    })
  );

  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  const error = vi.spyOn(console, "error").mockImplementation((msg?: unknown) => {
    lines.push(String(msg));
  });
  process.exitCode = undefined;

  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return { stdout: lines.join("\n"), exitCode: process.exitCode, requestedUrl };
  } finally {
    log.mockRestore();
    error.mockRestore();
    process.exitCode = undefined;
  }
}

describe("nexus api — a path that repeats the prefix is refused before the network", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  for (const typed of [
    "/api/public/v1/models",
    "/public/v1/models",
    "/api/v1/models",
    "/v1/models"
  ]) {
    it(`refuses ${typed} and names /models`, async () => {
      const run = await runApi(["api", "GET", typed]);

      expect(run.exitCode).toBe(EXIT_CODES["invalid-input"]);
      // NOTHING LEFT THE PROCESS. A refusal that still sends the request would
      // pass an exit-code assertion and cost the 404 it exists to prevent.
      expect(run.requestedUrl).toBeUndefined();
      expect(run.stdout).toContain("/models");
    });
  }

  it("names the LONGEST prefix, so one refusal is enough", async () => {
    const run = await runApi(["api", "GET", "/api/public/v1/models"]);

    // Matching a SHORTER prefix first would correct to `/public/v1/models` or
    // `/v1/models`, each of which this same rule refuses again — two refusals
    // for one paste. Assert the correction it actually offers, not the absence
    // of a substring: the hint quotes the doubled URL, which contains every
    // shorter form by construction.
    expect(run.stdout).toContain('"/api/public/v1" repeats it');
    expect(run.stdout).toContain("Send /models instead");
  });

  it("CONTROL — an ordinary path still reaches the network", async () => {
    const run = await runApi(["api", "GET", "/models"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.requestedUrl).toBe("https://api.nexusgpt.io/api/public/v1/models");
  });

  it("CONTROL — /videos is not read as /v1 plus a suffix", async () => {
    const run = await runApi(["api", "GET", "/videos"]);

    expect(run.exitCode).toBeUndefined();
    expect(run.requestedUrl).toBe("https://api.nexusgpt.io/api/public/v1/videos");
  });
});

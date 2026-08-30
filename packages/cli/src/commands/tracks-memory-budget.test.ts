import type { ListTrackMemoryEntriesResponse } from "@agent-nexus/sdk";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * `tracks memory list` MUST SHOW THE BYTE BUDGET TO A PERSON, NOT ONLY TO --json.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS FOR
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The command's own one-line description promises "with the byte budget".
 * `trackMemoryBytes` and `budgetBytes` have been on this envelope the whole time,
 * and the human table printed neither — so the promise was kept only in `--json`,
 * the channel a person is not using. `budgetBytes` appears EXACTLY ONCE in the
 * whole wire surface, on this response, so there was no other command to get it
 * from either.
 *
 * ── WHY A CANNED ENVELOPE RATHER THAN THE REAL SDK RESOURCE ─────────────────
 *
 * The sibling driven tests put the REAL resource over a fake request, because
 * they ask which METHOD, PATH and BODY the CLI requests. This file asks a
 * different question — what reaches the terminal — so the response is canned and
 * the assertion is on rendering. Mocking the resource here would test the fake.
 *
 * ── WHY BOTH CHANNELS ARE DRIVEN ────────────────────────────────────────────
 *
 * They fail on opposite mutations. A human-channel assertion alone goes green
 * over a footer that also leaks into the JSON document and corrupts a script's
 * answer. A JSON assertion alone is exactly the blindness that let this defect
 * ship: as the sibling harness puts it, a value dropped only from the
 * human-readable rendering is invisible to every JSON-mode test.
 */

const ENVELOPE: ListTrackMemoryEntriesResponse = {
  entries: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      trackId: "22222222-2222-4222-8222-222222222222",
      key: "staging-url",
      value: "https://api-staging.example.com",
      valueBytes: 31,
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:00:00.000Z"
    }
  ],
  trackMemoryBytes: 2341,
  budgetBytes: 8000
};

const listMemoryEntries = vi.hoisted(() => vi.fn());

vi.mock("../client", () => ({
  createClient: () => ({ tracks: { listMemoryEntries } })
}));

import { registerTracksCommands } from "./tracks";

const TRACK = "22222222-2222-4222-8222-222222222222";

/** Drive the real command and capture everything it wrote to stdout. */
async function drive(json: boolean, envelope: ListTrackMemoryEntriesResponse): Promise<string> {
  listMemoryEntries.mockResolvedValue(envelope);

  const program = new Command();
  program.name("nexus").exitOverride();
  registerTracksCommands(program);
  setJsonMode(json);

  const chunks: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };

  try {
    await program.parseAsync(["node", "nexus", "tracks", "memory", "list", TRACK]);
  } finally {
    console.log = log;
    setJsonMode(false);
  }

  return chunks.join("\n");
}

afterEach(() => {
  vi.clearAllMocks();
  setJsonMode(false);
});

describe("tracks memory list shows the byte budget in the human channel", () => {
  it("prints the used total against the budget", async () => {
    const out = await drive(false, ENVELOPE);

    expect(out).toContain("2341 of 8000 byte(s) used.");
  });

  it("CONTROL: the line is rendered from the envelope, not hardcoded", async () => {
    // A literal string would satisfy the assertion above. This changes both
    // numbers and fails first if either stops being read.
    const out = await drive(false, { ...ENVELOPE, trackMemoryBytes: 77, budgetBytes: 512 });

    expect(out).toContain("77 of 512 byte(s) used.");
  });

  it("CONTROL: the human channel really rendered the table, not the document", async () => {
    // Proves `drive(false, …)` exercised the human path at all. Without this, a
    // footer asserted against a document would read as a human-channel pass.
    const out = await drive(false, ENVELOPE);

    expect({ table: out.includes("staging-url"), json: out.includes('"budgetBytes"') }).toEqual({
      table: true,
      json: false
    });
  });

  it("--json still carries both fields and is NOT contaminated by the human line", async () => {
    // `printEnvelope` returns before the callback under --json. Asserted rather
    // than assumed: a footer printed outside that callback would corrupt every
    // script parsing this command.
    const out = await drive(true, ENVELOPE);

    expect({
      used: out.includes('"trackMemoryBytes"'),
      budget: out.includes('"budgetBytes"'),
      humanLine: out.includes("byte(s) used.")
    }).toEqual({ used: true, budget: true, humanLine: false });
  });
});

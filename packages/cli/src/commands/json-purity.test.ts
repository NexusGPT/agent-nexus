import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

/**
 * The root epilogue makes two cross-cutting promises that every command owes,
 * and one line of `console.log` breaks both at once:
 *
 *   READING THE OUTPUT — "--json prints ONE JSON document on STDOUT and
 *   nothing else."
 *   FAILURE            — "EVERY failure exits 1."
 *
 * `customer get-by-external-id` did exactly that: on a miss it printed
 * `No customer found.` to stdout and returned, so the output was unparseable
 * prose AND the exit code was 0. A caller could not detect the failure by
 * SHAPE or by STATUS — the one combination nothing downstream can work around.
 *
 * A miss here is a 200 with an empty body, not a 404, so `handleError` never
 * sees it and no error-path test would have caught it. This file drives the
 * commands whose 2xx can mean "absent" and asserts both promises together.
 * `printNotFound` is the verb that satisfies them; these are the cases that
 * fail if anyone reaches for a bare `console.log` again.
 */

const fakeClient = {
  customers: {
    getByExternalId: vi.fn()
  },
  models: {
    list: vi.fn()
  },
  skillFolders: {
    list: vi.fn()
  }
};

vi.mock("../client", () => ({
  createClient: () => fakeClient,
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerCustomerCommands } from "./customer";
import { registerModelCommands } from "./model";
import { registerSkillFolderCommands } from "./skill-folder";

interface Run {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

/** Run one argv under `--json`, capturing both streams and the exit code. */
async function runJson(argv: string[]): Promise<Run> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON");
  registerCustomerCommands(program);
  registerModelCommands(program);
  registerSkillFolderCommands(program);

  setJsonMode(true);
  process.exitCode = undefined;

  const stdout: string[] = [];
  const stderr: string[] = [];
  const outSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...a: unknown[]) => void stdout.push(a.map(String).join(" ")));
  const errSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...a: unknown[]) => void stderr.push(a.map(String).join(" ")));

  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    setJsonMode(false);
  }

  const exitCode = process.exitCode;
  process.exitCode = undefined;
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), exitCode };
}

/**
 * Assert the READING THE OUTPUT promise: stdout is ONE JSON document.
 *
 * `JSON.parse` is the whole check and it is stricter than it looks — it rejects
 * a prose trailer, a prose header, and two concatenated JSON values alike.
 */
function parseSoleDocument(stdout: string): unknown {
  expect(stdout.trim()).not.toBe("");
  return JSON.parse(stdout);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.exitCode = undefined;
});

describe("a not-found under --json is one JSON document AND a nonzero exit", () => {
  it("customer get-by-external-id: the miss that used to print prose at exit 0", async () => {
    fakeClient.customers.getByExternalId.mockResolvedValue(null);

    const run = await runJson(["customer", "get-by-external-id", "nobody@example.com"]);

    // Promise 1 — parseable, and nothing but the document.
    const doc = parseSoleDocument(run.stdout) as { error?: { message?: string } };
    expect(doc.error?.message).toContain("nobody@example.com");
    // Promise 2 — a failure exits 1.
    expect(run.exitCode).toBe(1);
    // And it must not be mistakable for a success document.
    expect(run.stdout).not.toContain("success");
  });

  it("a hit stays a success document at exit 0 — the guard must not invert", async () => {
    fakeClient.customers.getByExternalId.mockResolvedValue({
      id: "cus_1",
      displayName: "Ada"
    });

    const run = await runJson(["customer", "get-by-external-id", "ada@example.com"]);

    expect(parseSoleDocument(run.stdout)).toMatchObject({ id: "cus_1" });
    expect(run.exitCode).toBeUndefined();
  });
});

/**
 * The other half of the same class: a command that reads the WRONG KEY out of a
 * response envelope. It cannot throw, so nothing exits nonzero — it just prints
 * an empty document that is indistinguishable from an empty account.
 *
 * `model list` read `{ models }` from a route that returns a flat array, so
 * `--json` printed `{}` for 45 models and the table threw on `undefined.length`.
 */
describe("a list command renders the rows the API actually returned", () => {
  const MODELS = [
    {
      id: "m1",
      modelId: "GPT_4_1",
      provider: "OPEN_AI",
      displayName: "GPT-4.1",
      contextSize: 1000
    },
    { id: "m2", modelId: "SONNET", provider: "ANTHROPIC", displayName: "Sonnet", contextSize: 2000 }
  ];

  it("model list carries every row into the JSON document", async () => {
    fakeClient.models.list.mockResolvedValue(MODELS);

    const run = await runJson(["model", "list"]);

    const doc = parseSoleDocument(run.stdout) as { data?: unknown[] };
    expect(doc.data).toHaveLength(2);
    expect(doc.data).toEqual(MODELS);
  });

  it("model list does not throw on the human path either", async () => {
    fakeClient.models.list.mockResolvedValue(MODELS);
    setJsonMode(false);

    const program = new Command();
    program.name("nexus");
    registerModelCommands(program);
    const lines: string[] = [];
    const spy = vi
      .spyOn(console, "log")
      .mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" ")));
    try {
      await program.parseAsync(["node", "nexus", "model", "list"]);
    } finally {
      spy.mockRestore();
    }

    expect(process.exitCode).toBeUndefined();
    expect(lines.join("\n")).toContain("GPT-4.1");
  });

  it("skill-folder list keeps BOTH halves the endpoint returns", async () => {
    fakeClient.skillFolders.list.mockResolvedValue({
      folders: [{ id: "f1", name: "Ops", parentId: null }],
      assignments: [{ skillId: "s1", folderId: "f1" }]
    });

    const run = await runJson(["skill-folder", "list"]);

    const doc = parseSoleDocument(run.stdout) as {
      folders?: unknown[];
      assignments?: unknown[];
    };
    // The assignments were dropped from BOTH channels before this — the command
    // could not do the thing its own one-line description promises.
    expect(doc.folders).toHaveLength(1);
    expect(doc.assignments).toEqual([{ skillId: "s1", folderId: "f1" }]);
  });
});

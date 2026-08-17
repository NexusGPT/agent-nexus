import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * NEX-3621 — `model list --json` printed `{}` at exit 0.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * AN EMPTY RESULT AND A BROKEN COMMAND MUST NOT BE THE SAME OUTPUT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * On 0.18.1 the action read `const { models } = await client.models.list()`
 * against a route that answers a FLAT ARRAY. `models` was `undefined`, so
 * `printList` emitted `{ data: undefined }` — which `JSON.stringify` renders as
 * `{}` — and the table threw on `undefined.length`.
 *
 * The `--json` half is the dangerous one, and not because it is wrong. It is
 * dangerous because it is INDISTINGUISHABLE: `{}` at exit 0 reads exactly like
 * an organization that genuinely has no models. Every caller downstream — and
 * the bundled Cue skill mandates this command for model discovery — reads an
 * empty answer and proceeds. The text form at least crashed.
 *
 * ── WHAT ALREADY PROTECTS THIS, AND WHAT DID NOT ────────────────────────────
 *
 * The read is now `const models = await client.models.list()` against an SDK
 * declaring `Promise<ModelSummary[]>`, so the 0.18.1 spelling is a COMPILE
 * error. Verified by mutation rather than by reading: restoring the destructure
 * fails with `TS2339: Property 'models' does not exist on type
 * 'ModelSummary[]'`.
 *
 * That closes the door the defect came through and closes no other. `tsc` says
 * nothing about what the command PRINTS, and nothing about whether the three
 * outcomes a caller must tell apart are actually different documents. This file
 * is that half: it drives the real command and reads what a caller reads.
 *
 * ⚠️ THE POPULATED CASE IS THE CONTROL, NOT DECORATION. A suite that only
 * asserted `{"data":[]}` on an empty org would pass against a command that
 * answers `{"data":[]}` for EVERY org — the same defect with a better-looking
 * document. Empty and populated are asserted together, and the case that
 * matters is the one comparing them.
 */
/**
 * 🚨 HOISTED, BEFORE THE IMPORTS. `config.ts` computes its config directory from
 * `os.homedir()` at MODULE LOAD, so a `beforeAll` that moves `HOME` is too late.
 *
 * A real config file rather than a mocked `../config`: `createClient` calls
 * `resolveProfile` and `resolveOrganization`, not just the two resolvers a first
 * draft stubbed — so every case failed with "No profiles configured" and the
 * mock had quietly moved the test off the path the command actually takes.
 */
const SANDBOX = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/nexus-model-list-${process.pid}`;
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  return dir;
});

import fs from "node:fs";
import path from "node:path";

import { setJsonMode } from "../output";
import { registerModelCommands } from "./model";

fs.mkdirSync(path.join(SANDBOX, ".nexus-mcp"), { recursive: true });
fs.writeFileSync(
  path.join(SANDBOX, ".nexus-mcp", "config.json"),
  JSON.stringify({
    activeProfile: "test",
    profiles: { test: { apiKey: "nxs_test", baseUrl: "https://api.nexusgpt.io" } }
  })
);

interface Run {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
}

/** One model row, shaped as `ModelSummary` on the wire. */
function model(index: number): Record<string, unknown> {
  return {
    id: `11111111-1111-4111-8111-00000000000${index}`,
    modelId: `gpt-test-${index}`,
    provider: "OPEN_AI",
    displayName: `Test Model ${index}`,
    modelName: `gpt-test-${index}`,
    contextSize: 128000,
    streaming: true,
    thinkingDialect: null,
    deprecated: false,
    source: "system"
  };
}

/**
 * Run the real `model list` against a stubbed route.
 *
 * `body` is what the route puts inside the v1 envelope's `data` — so a test can
 * hand it the flat array the contract declares, or the `{ models: [...] }`
 * wrapper the CLI once believed in.
 */
async function runModelList(body: unknown, json: boolean): Promise<Run> {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: body }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    )
  );

  const program = new Command();
  program.name("nexus");
  registerModelCommands(program);

  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((m?: unknown) => {
    out.push(String(m));
  });
  const error = vi.spyOn(console, "error").mockImplementation((m?: unknown) => {
    err.push(String(m));
  });

  process.exitCode = undefined;
  setJsonMode(json);

  try {
    await program.parseAsync(["node", "nexus", "model", "list"]);
    return { stdout: out.join("\n"), stderr: err.join("\n"), exitCode: process.exitCode };
  } finally {
    setJsonMode(false);
    log.mockRestore();
    error.mockRestore();
    process.exitCode = undefined;
  }
}

describe("model list --json — an empty org and a broken read are different documents", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a populated org answers {data:[…]} with every row", async () => {
    const rows = [model(1), model(2), model(3)];
    const run = await runModelList(rows, true);

    expect(run.exitCode).toBeUndefined();
    const doc = JSON.parse(run.stdout) as { data: unknown[] };
    expect(Array.isArray(doc.data)).toBe(true);
    expect(doc.data).toHaveLength(3);
    // The field the bundled skill tells a reader to select on.
    expect((doc.data[0] as { modelId: string }).modelId).toBe("gpt-test-1");
  });

  it("an EMPTY org answers {data:[]} — parseable, and NOT the 0.18.1 `{}`", async () => {
    const run = await runModelList([], true);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout.replace(/\s/g, "")).not.toBe("{}");

    const doc = JSON.parse(run.stdout) as { data: unknown[] };
    expect(Array.isArray(doc.data)).toBe(true);
    expect(doc.data).toHaveLength(0);
  });

  it("THE CASE THAT MATTERS — empty and populated are distinguishable", async () => {
    // The defect was not a wrong document. It was two different states
    // rendering as one, so no caller could branch. Asserting each shape alone
    // would pass against a command that answered `{"data":[]}` for every org.
    const empty = JSON.parse((await runModelList([], true)).stdout) as { data: unknown[] };
    const full = JSON.parse((await runModelList([model(1)], true)).stdout) as { data: unknown[] };

    expect(empty.data).toHaveLength(0);
    expect(full.data).toHaveLength(1);
    expect(empty).not.toEqual(full);
  });

  it("the text form does NOT throw on an empty org", async () => {
    // 0.18.1's text form exited 1 on `Cannot read properties of undefined
    // (reading 'length')`. An org with no models must be an ordinary, quiet
    // answer — not a crash that reads as a broken CLI.
    const run = await runModelList([], false);

    expect(run.exitCode).toBeUndefined();
    expect(run.stderr).not.toContain("Cannot read properties");
  });

  it("the text form renders a row on a populated org", async () => {
    // CONTROL for the case above: a command that printed nothing in BOTH states
    // would satisfy "does not throw" and be just as useless.
    const run = await runModelList([model(7)], false);

    expect(run.exitCode).toBeUndefined();
    expect(run.stdout).toContain("Test Model 7");
  });

  it("a route that regressed to the {models:[…]} wrapper does NOT read as an empty org", async () => {
    // 🚨 THE DOOR `tsc` CANNOT WATCH. The compile error protects the CLI from
    // re-reading a flat array as a wrapper; it says nothing about the ROUTE
    // changing shape underneath a correct read. If that ever happens the output
    // must be visibly wrong rather than quietly empty — which is the whole
    // property this ticket is about, one layer up.
    const run = await runModelList({ models: [model(1)] }, true);

    const doc = JSON.parse(run.stdout) as { data: unknown };
    expect(Array.isArray(doc.data)).toBe(false);
    // A caller's `jq '.data[]'` fails loudly on an object rather than selecting
    // nothing, and `.data` is plainly not the array the help documents.
    expect(doc.data).toEqual({ models: [model(1)] });
  });
});

import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * THE FIELDS `--json` USED TO DROP, ASSERTED ON THE DOCUMENT ITSELF.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE SCAN IS NOT THE PROOF. IT PROVES THE PRINTER CHANGED, NOT THE DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `envelope-narrowing.scan.ts` asks the type checker which keys a printer never
 * sees, and its ledger is how the population is measured. Both are statements
 * about the SHAPE OF THE CODE. Neither runs a command, and neither reads a byte
 * of what `--json` actually writes — so a cure that satisfies the scan and
 * emits the wrong document is green there.
 *
 * Every case below drives the real registrar through commander with a stubbed
 * SDK resource, captures stdout, parses it, and names the field that used to be
 * missing. Each one FAILS against the pre-fix printer, which is the only thing
 * that makes a green here worth reading.
 *
 * ⚠️ TWO COMMANDS IN THE LEDGER WERE NEVER DEFECTS, AND THEY ARE MARKED
 * `CONTROL` RATHER THAN HIDDEN. `known-issues` and `vibe deploy` both opened
 * with `if (isJsonMode()) { console.log(JSON.stringify(x)); return; }`, so the
 * whole response already reached `--json` and the printer below it was the
 * human branch. The scan cannot see that early return — it is the same shape
 * `json-shape.scan.ts` needs `SELF_JSON_MARKERS` for — so it reported them as
 * narrowings and the ledger recorded keys they never lost. Their cases pass
 * against the pre-fix code too, deliberately: they assert that adopting
 * `printEnvelope` did NOT change a document that was already complete.
 */

const analyticsQuery = vi.fn();
const analyticsQueryStructured = vi.fn();
const listExternalTools = vi.fn();
const listDocumentTemplates = vi.fn();
const listTasks = vi.fn();
const toolsSearch = vi.fn();
const toolsSkills = vi.fn();
const getCostBreakdown = vi.fn();
const awaitThread = vi.fn();
const getThread = vi.fn();
const waitForThread = vi.fn();
const forRoute = vi.fn();

vi.mock("../client", () => ({
  createClient: () => ({
    analytics: { query: analyticsQuery, queryStructured: analyticsQueryStructured },
    skills: {
      listExternalTools,
      listDocumentTemplates,
      listTasks
    },
    tools: { search: toolsSearch, skills: toolsSkills },
    tracing: { getCostBreakdown },
    promptAssistant: { awaitThread, getThread, waitForThread },
    knownIssues: { forRoute }
  }),
  seconds: (n: number) => n,
  MAX_TIMEOUT_SECONDS: 7200,
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerAnalyticsCommands } from "./analytics";
import { registerExternalToolCommands } from "./external-tool";
import { registerKnownIssuesCommand } from "./known-issues";
import { registerPromptAssistantCommands } from "./prompt-assistant";
import { registerTaskCommands } from "./task";
import { registerTemplateCommands } from "./template";
import { registerToolCommands } from "./tool";
import { registerTracingCommands } from "./tracing";

type Registrar = (program: Command) => void;

/** Drive one registrar under `--json` and hand back the document it wrote. */
async function runJson(register: Registrar, argv: string[]): Promise<Record<string, unknown>> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  register(program);
  setJsonMode(true);

  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  // `emitDocument` diverts a SECOND document here, and the printers write their
  // human footers here too. Swallow it so a footer never lands in `stdout`.
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const previousExitCode = process.exitCode;
  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
  } finally {
    log.mockRestore();
    write.mockRestore();
    setJsonMode(false);
    process.exitCode = previousExitCode;
  }

  const stdout = out.join("\n");
  // One document, and no prose beside it. Without this a case could pass by
  // reading the FIRST of two concatenated documents, which no consumer can.
  expect(describeStdout(stdout), `stdout was:\n${stdout}`).toEqual({ documents: 1, prose: false });
  return JSON.parse(stdout) as Record<string, unknown>;
}

const QUERY_RESULT = {
  rows: [{ n: 3 }],
  fields: [{ name: "n" }],
  rowCount: 1,
  executionTimeMs: 12,
  truncated: true,
  error: null,
  generatedSql: "SELECT 1"
};

beforeEach(() => {
  vi.clearAllMocks();
  analyticsQuery.mockResolvedValue(QUERY_RESULT);
  analyticsQueryStructured.mockResolvedValue(QUERY_RESULT);
  listExternalTools.mockResolvedValue({ items: [{ id: "e1", name: "Weather" }], total: 41 });
  listDocumentTemplates.mockResolvedValue({ items: [{ id: "t1", name: "Invoice" }], total: 9 });
  listTasks.mockResolvedValue({ items: [{ id: "k1", name: "Summarize" }], total: 77 });
  toolsSearch.mockResolvedValue({
    tools: [{ id: "s1", name: "Slack" }],
    facets: { categories: [{ value: "Communication", count: 12 }] },
    total: 12
  });
  toolsSkills.mockResolvedValue({ skills: [{ id: "w1", name: "Onboarding" }], total: 5 });
  getCostBreakdown.mockResolvedValue({
    entries: [{ groupKey: "gpt-4o|dep-1", groupLabel: "gpt-4o" }],
    dimensions: ["model", "deployment"]
  });
  const thread = { threadId: "th-1", status: "completed", messages: [], promptResult: null };
  awaitThread.mockResolvedValue({ thread, outcome: "timed-out", waitedMs: 55_000 });
  getThread.mockResolvedValue(thread);
  waitForThread.mockResolvedValue({ thread, outcome: "timed-out", waitedMs: 30_000 });
  forRoute.mockResolvedValue({
    route: "agent.list",
    polled: true,
    issues: [{ identifier: "NEX-1", status: "Todo", title: "t", url: "u" }],
    capturedAt: "2026-08-18T09:00:00.000Z"
  });
});

describe("analytics — `truncated` says the answer is PARTIAL", () => {
  it("carries truncated, rowCount and executionTimeMs on `query`", async () => {
    const doc = await runJson(registerAnalyticsCommands, ["analytics", "query", "SELECT 1"]);

    // The whole ticket, in one assertion: a script reading `rows` alone reads a
    // TRUNCATED result as a complete one, and nothing on stdout said otherwise.
    expect(doc.truncated).toBe(true);
    expect(doc.rowCount).toBe(1);
    expect(doc.executionTimeMs).toBe(12);
    expect(doc.rows).toEqual([{ n: 3 }]);
  });

  it("carries them on `metrics` too — two leaves, one printer", async () => {
    const doc = await runJson(registerAnalyticsCommands, ["analytics", "metrics", "node_runs"]);

    expect(doc.truncated).toBe(true);
    expect(doc.rowCount).toBe(1);
    expect(doc.executionTimeMs).toBe(12);
  });
});

describe("the list commands carry `total`, so a full-looking page is checkable", () => {
  it("external-tool list", async () => {
    const doc = await runJson(registerExternalToolCommands, ["external-tool", "list"]);
    expect(doc.total).toBe(41);
    expect(doc.items).toHaveLength(1);
  });

  it("template list", async () => {
    const doc = await runJson(registerTemplateCommands, ["template", "list"]);
    expect(doc.total).toBe(9);
    expect(doc.items).toHaveLength(1);
  });

  it("task list", async () => {
    const doc = await runJson(registerTaskCommands, ["task", "list"]);
    expect(doc.total).toBe(77);
    expect(doc.items).toHaveLength(1);
  });

  it("tool skills", async () => {
    const doc = await runJson(registerToolCommands, ["tool", "skills"]);
    expect(doc.total).toBe(5);
    expect(doc.skills).toHaveLength(1);
  });
});

describe("tool search carries `facets` — reachable from no other command", () => {
  it("names every category with its count", async () => {
    const doc = await runJson(registerToolCommands, ["tool", "search", "--query", "slack"]);

    expect(doc.facets).toEqual({ categories: [{ value: "Communication", count: 12 }] });
    expect(doc.total).toBe(12);
    expect(doc.tools).toHaveLength(1);
  });
});

describe("tracing cost-breakdown carries `dimensions`", () => {
  it("says which half of a composite groupKey is which", async () => {
    const doc = await runJson(registerTracingCommands, [
      "tracing",
      "cost-breakdown",
      "--group-by",
      "model"
    ]);

    // Without this the row key `gpt-4o|dep-1` is two values and no schema.
    expect(doc.dimensions).toEqual(["model", "deployment"]);
    expect(doc.entries).toHaveLength(1);
  });
});

describe("the prompt-assistant waits carry `outcome`", () => {
  it("await-thread — the verdict is readable without inspecting $?", async () => {
    const doc = await runJson(registerPromptAssistantCommands, [
      "prompt-assistant",
      "await-thread",
      "th-1"
    ]);

    expect(doc.outcome).toBe("timed-out");
    expect(doc.waitedMs).toBe(55_000);
    expect((doc.thread as { threadId?: unknown }).threadId).toBe("th-1");
  });

  it("get-thread --wait — the same verdict, the client-side poll", async () => {
    const doc = await runJson(registerPromptAssistantCommands, [
      "prompt-assistant",
      "get-thread",
      "th-1",
      "--wait"
    ]);

    expect(doc.outcome).toBe("timed-out");
    expect((doc.thread as { threadId?: unknown }).threadId).toBe("th-1");
  });

  it("get-thread WITHOUT --wait is unchanged — the thread flat, no wrapper", async () => {
    // The branch that must NOT move. It adopted `printEnvelope` so the command
    // has ONE derivable shape, and the response IS the thread, so the document
    // is byte-identical to what `printRecord` wrote.
    const doc = await runJson(registerPromptAssistantCommands, [
      "prompt-assistant",
      "get-thread",
      "th-1"
    ]);

    expect(doc.threadId).toBe("th-1");
    expect(doc.thread).toBeUndefined();
    expect(doc.outcome).toBeUndefined();
  });
});

describe("CONTROL — the two the scan misread were already complete", () => {
  /**
   * These pass against the PRE-FIX code as well, and saying so is the point.
   * `known-issues` returned its own document before the printer ran, so
   * `capturedAt` was never dropped — the ledger recorded a key this command
   * does not lose. Adopting `printEnvelope` must leave that document alone.
   */
  it("known-issues still carries capturedAt and polled", async () => {
    const doc = await runJson(registerKnownIssuesCommand, ["known-issues", "agent.list"]);

    expect(doc.capturedAt).toBe("2026-08-18T09:00:00.000Z");
    expect(doc.polled).toBe(true);
    expect(doc.issues).toHaveLength(1);
  });

  it("known-issues carries polled on the NOT-POLLED branch, which prints no table", async () => {
    // The branch where the human arm returns before reaching `printTable`. The
    // document must still be the whole response.
    forRoute.mockResolvedValue({
      route: "agent.list",
      polled: false,
      issues: [],
      capturedAt: null
    });
    const doc = await runJson(registerKnownIssuesCommand, ["known-issues", "agent.list"]);

    expect(doc.polled).toBe(false);
    expect(doc.route).toBe("agent.list");
  });
});

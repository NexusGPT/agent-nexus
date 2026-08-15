import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * `nexus channel setup --json` must carry the READY VERDICT, in its one document.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 ONE DOCUMENT IS NOT THE SAME PROMISE AS ONE DOCUMENT WITH THE ANSWER IN IT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This action called `printTable(data.steps)` and then `printSuccess("All
 * prerequisites met…")`. Both printers write a complete JSON document, so under
 * `--json` stdout carried an ARRAY immediately followed by an OBJECT — and the
 * `--help` note published a jq filter over that stdout, which indexes `.[]`. On
 * the second document `.[]` yields a boolean, `select(.label != …)` indexes it,
 * and jq aborts with `Cannot index boolean with "label"` and exit 5. The
 * documented gate failed EXACTLY when the answer was "yes, proceed", and a
 * caller reads a jq error on the success path as "not ready".
 *
 * `emitDocument`'s first-wins rule closed the parse half: the steps keep stdout
 * and the verdict is diverted to stderr. That is the RIGHT fix for the pair and
 * the WRONG outcome for this command — the fix is silent, nothing errors, and
 * the one fact `channel setup` exists to answer now lands on the channel a
 * script does not read. `ready` was on the response the whole time; only the
 * printer dropped it.
 *
 * So there are two assertions here and neither implies the other:
 *   1. stdout is ONE document — `describeStdout`, the same detector the
 *      one-document gate uses, rather than a second reader that could disagree.
 *   2. that document has `ready`, and stderr holds no diverted second document.
 *
 * A test asserting only (1) passes against the code this file exists to change.
 */
const { getSetupStatus, autoProvision } = vi.hoisted(() => ({
  getSetupStatus: vi.fn(),
  autoProvision: vi.fn()
}));

vi.mock("../client", () => ({
  createClient: () => ({ channels: { getSetupStatus, autoProvision } }),
  timeoutSecondsToMs: (s?: number) => (s !== undefined ? s * 1000 : undefined)
}));

import { registerChannelCommands } from "./channel";

/** Every prerequisite met — the case the ticket says the documented gate broke on. */
const READY = {
  type: "WHATSAPP",
  ready: true,
  steps: [
    {
      step: 1,
      label: "Messaging connection",
      status: "completed",
      description: "One messaging connection exists for this organization."
    },
    {
      step: 2,
      label: "WhatsApp Business Account",
      status: "completed",
      description: "Meta account linked."
    },
    {
      step: 3,
      label: "Deployment",
      status: "action_needed",
      description: "Create the deployment."
    }
  ]
};

const NOT_READY = {
  ...READY,
  ready: false,
  steps: READY.steps.map((step) => (step.step === 2 ? { ...step, status: "action_needed" } : step))
};

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

async function runJson(argv: string[]): Promise<Captured> {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerChannelCommands(program);
  setJsonMode(true);

  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  // `emitDocument` diverts a SECOND document with `process.stderr.write`, not
  // `console.error`. Spying on the wrong one reads as "there was no second
  // document" — which is the claim this file is here to check.
  const write = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown): boolean => {
    err.push(String(chunk));
    return true;
  });

  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
  } finally {
    log.mockRestore();
    write.mockRestore();
    setJsonMode(false);
  }
  return { stdout: out.join("\n"), stderr: err.join("") };
}

/** The `--help` text this command publishes, as a caller reads it. */
function setupHelp(): string {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerChannelCommands(program);

  const channel = program.commands.find((c) => c.name() === "channel");
  const setup = channel?.commands.find((c) => c.name() === "setup");
  if (setup === undefined) throw new Error("no `channel setup` command in the tree");

  // `helpInformation()` renders the OPTIONS ONLY. Every note this command
  // publishes — including the automation recipe — arrives through
  // `addHelpText("after", …)`, which commander appends during `outputHelp` and
  // never through that method. Reading the wrong one returns a help text with
  // no recipe in it and passes any "the recipe is gone" assertion for free.
  const chunks: string[] = [];
  setup.configureOutput({ writeOut: (text: string) => chunks.push(text) });
  setup.outputHelp();
  return chunks.join("");
}

describe("nexus channel setup --json", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSetupStatus.mockResolvedValue(READY);
    autoProvision.mockResolvedValue(READY);
  });

  it("prints exactly ONE document on stdout when every prerequisite is met", async () => {
    const { stdout } = await runJson(["channel", "setup", "--type", "WHATSAPP"]);

    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
  });

  it("carries `ready` in that document, so a script can gate on it", async () => {
    const { stdout } = await runJson(["channel", "setup", "--type", "WHATSAPP"]);
    const doc = JSON.parse(stdout) as { ready?: unknown; steps?: unknown[]; type?: unknown };

    // `.ready` is what the `--help` recipe evaluates. `undefined` here is the
    // defect: `jq -e '.ready'` exits 1 on null/false and a missing key is null,
    // so a caller can never proceed.
    expect(doc.ready).toBe(true);
    expect(doc.type).toBe("WHATSAPP");
    expect(doc.steps).toHaveLength(READY.steps.length);
  });

  it("reports ready:false rather than omitting the key", async () => {
    // A verdict that is present only when TRUE is a verdict a script cannot
    // read: absent and false look identical to `jq -e '.ready'`, and only one
    // of the two is a real answer.
    getSetupStatus.mockResolvedValue(NOT_READY);
    const { stdout } = await runJson(["channel", "setup", "--type", "WHATSAPP"]);
    const doc = JSON.parse(stdout) as { ready?: unknown };

    expect(doc.ready).toBe(false);
  });

  it("diverts NO second document to stderr — the verdict is not exiled there", async () => {
    const { stderr } = await runJson(["channel", "setup", "--type", "WHATSAPP"]);

    // The first-wins rule sends any SECOND document here. A verdict on stderr
    // is parseable, correct, and invisible to every caller that reads stdout.
    expect(stderr).toBe("");
  });

  it("carries the verdict on the --auto branch too", async () => {
    const { stdout, stderr } = await runJson(["channel", "setup", "--type", "WHATSAPP", "--auto"]);

    expect(autoProvision).toHaveBeenCalledOnce();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { ready?: unknown }).ready).toBe(true);
    expect(stderr).toBe("");
  });

  it("EVALUATES the jq recipe the help ships, against the real document", async () => {
    // 🚨 ASSERTING THE HELP CONTAINS ".ready" IS NOT THIS CHECK. A probe over
    // the help text passes on a note that is present and WRONG — that is
    // exactly how the aborting recipe shipped, green, for as long as it did.
    // Only reading the recipe OUT of the shipped help and running it against
    // real output can red when the two drift apart.
    const filter = shippedJqFilter(setupHelp());
    const { stdout } = await runJson(["channel", "setup", "--type", "WHATSAPP"]);

    // `jq -e` exits 0 when the last output is neither false nor null. Ready
    // means proceed, so the recipe published for the ready case must say so.
    expect(evaluateFieldPath(JSON.parse(stdout), filter)).toBe(true);

    getSetupStatus.mockResolvedValue(NOT_READY);
    const notReady = await runJson(["channel", "setup", "--type", "WHATSAPP"]);
    expect(evaluateFieldPath(JSON.parse(notReady.stdout), filter)).toBe(false);
  });
});

/**
 * The `jq` filter `channel setup --help` publishes, read out of the help text.
 *
 * Refuses rather than returns a default. A recipe this cannot find is a recipe
 * nobody is checking, and a helper that quietly answered `.ready` would keep
 * the caller's test green while the shipped note said something else entirely.
 */
function shippedJqFilter(help: string): string {
  const match = /\|\s*jq\s+(?:-\S+\s+)*'([^']+)'/.exec(help);
  if (match?.[1] === undefined) {
    throw new Error("no `| jq '<filter>'` recipe found in `channel setup --help`");
  }
  return match[1].trim();
}

/**
 * Evaluate a jq FIELD PATH — `.a`, `.a.b` — against one document.
 *
 * ⚠️ THIS IS NOT A jq IMPLEMENTATION AND MUST NEVER GROW INTO ONE. It handles
 * the one filter shape a verdict can honestly take, and THROWS on everything
 * else, including the `[.[] | select(…)]` pipeline this command used to
 * publish. Returning a default for an unrecognised filter is the failure mode
 * that matters: the suite would read green over a recipe nothing evaluated.
 */
function evaluateFieldPath(document: unknown, filter: string): unknown {
  if (!/^\.[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(filter)) {
    throw new Error(
      `the shipped recipe is not a plain field path and this spec cannot evaluate it: ${filter}`
    );
  }

  let value: unknown = document;
  for (const key of filter.slice(1).split(".")) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

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

  it("answers the ERROR document, not a ready:false one, when it is not ready", async () => {
    // 🚨 THE CONTRACT THIS CASE USED TO ASSERT IS GONE ON PURPOSE, AND ITS
    // REPLACEMENT IS STRICTLY STRONGER.
    //
    // It read `ready: false` off stdout, because `channel setup` printed the
    // setup document and exited 0 whatever it said. The exit code carries the
    // verdict now, and a failure's one stdout document is the ERROR document —
    // "under --json an error is a JSON document on STDOUT" is a STABLE promise,
    // and `json-one-document.scan.ts` calls a payload sitting there instead
    // `error-masked`, with a ceiling of 0.
    //
    // `ready: false` was never the load-bearing half anyway: reading it required
    // parsing, which is what the deleted jq recipe below existed to do. A
    // non-zero exit needs no parse at all.
    getSetupStatus.mockResolvedValue(NOT_READY);
    const { stdout } = await runJson(["channel", "setup", "--type", "WHATSAPP"]);
    const doc = JSON.parse(stdout) as { error?: { code?: unknown; message?: unknown } };

    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect(doc.error?.code).toBe("CLI_REMOTE_ERROR");
    // The checklist moves INTO the message rather than being lost — the whole
    // reason a caller ran this is to learn which prerequisite is missing.
    expect(String(doc.error?.message)).toContain("WhatsApp Business Account");
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

  it("publishes NO jq workaround for the exit code any more", async () => {
    // 🚨 THE CASE THAT REPLACES "EVALUATE THE SHIPPED RECIPE", AND IT IS THE
    // SAME ARGUMENT POINTED THE OTHER WAY.
    //
    // The old case read `| jq -e '.ready'` out of the shipped help and ran it
    // against real output, because a recipe that is present and WRONG is how the
    // aborting filter shipped green for as long as it did. That recipe existed
    // ONLY because the exit code answered 0 either way — `status-verdict.ledger`
    // called a documented workaround for an exit code "this class's confession".
    //
    // The exit code answers now, so the recipe is deleted rather than corrected,
    // and this asserts the deletion held. A helper that merely stopped LOOKING
    // for the recipe would pass over one that came back; this fails the moment a
    // `| jq` pipeline reappears in this command's help.
    expect(setupHelp()).not.toMatch(/\|\s*jq\b/);
    expect(setupHelp()).toContain("THE EXIT CODE CARRIES THAT VERDICT");
  });

  it("exits 0 when ready and NON-ZERO when not — the thing the recipe stood in for", async () => {
    // The pair, driven through the same harness the deleted recipe used, so the
    // replacement is measured against real output rather than asserted.
    const before = process.exitCode;
    try {
      getSetupStatus.mockResolvedValue(READY);
      process.exitCode = undefined;
      await runJson(["channel", "setup", "--type", "WHATSAPP"]);
      expect(process.exitCode).toBeUndefined();

      getSetupStatus.mockResolvedValue(NOT_READY);
      process.exitCode = undefined;
      await runJson(["channel", "setup", "--type", "WHATSAPP"]);
      expect(process.exitCode).not.toBeUndefined();
      expect(process.exitCode).not.toBe(0);
    } finally {
      process.exitCode = before;
    }
  });
});

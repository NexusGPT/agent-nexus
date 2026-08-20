import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_CODES } from "../exit-codes";
import { setJsonMode } from "../output";
import { describeStdout } from "./json-one-document.scan";

/**
 * `nexus channel setup` CARRIES `ready` IN ITS EXIT CODE — BOTH WAYS.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS COMMAND'S OWN `--help` PUBLISHED THE WORKAROUND FOR ITS EXIT CODE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus channel setup --type WHATSAPP --json | jq -e '.ready'` was in the
 * shipped help. A documented workaround for an exit code is the admission, in
 * the product's own documentation, that the exit code cannot be believed.
 *
 * The exit code answers now, so the recipe is DELETED rather than corrected, and
 * `channel-setup-json-verdict.test.ts` beside this file asserts the deletion
 * held — it fails the moment a `| jq` pipeline reappears in this command's help.
 *
 * ── WHAT THE REFUSAL MUST NOT CLAIM ─────────────────────────────────────────
 *
 * ⚠️ `ready: true` IS NOT A CHECK FOR EVERY `--type`. A type with no real
 * prerequisites reports true having verified nothing, and the help says so. So
 * only the FALSE arm is new here: the success path exits `0` and makes exactly
 * the claim it made before, which is why there is no case below asserting that a
 * `ready: true` proves anything.
 *
 * ── THE REAL COMMAND TREE ───────────────────────────────────────────────────
 *
 * Every assertion drives `registerChannelCommands` through commander with only
 * the SDK client replaced. A spec walking its own table of expected outcomes
 * asserts against its own fixture and stays green with the defect restored.
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

const READY = {
  type: "WHATSAPP",
  ready: true,
  steps: [
    { step: 1, label: "Messaging connection", status: "completed", description: "One exists." },
    { step: 2, label: "WhatsApp Business Account", status: "completed", description: "Linked." }
  ]
};

const NOT_READY = {
  ...READY,
  ready: false,
  steps: [
    READY.steps[0],
    {
      step: 2,
      label: "WhatsApp Business Account",
      status: "action_needed",
      description: "Link it.",
      // The step's own next-step payload. It travels into the refusal's hint
      // rather than being pointed at — see the case below.
      action: {
        method: "POST",
        endpoint: "/api/public/v1/channels/whatsapp/connect",
        hint: "Complete Meta embedded signup first."
      }
    }
  ]
};

function tree(): Command {
  const program = new Command();
  program.name("nexus").exitOverride().option("--json", "Output as JSON");
  registerChannelCommands(program);
  return program;
}

async function run(argv: string[]): Promise<number | undefined> {
  const program = tree();
  const before = process.exitCode;
  process.exitCode = undefined;
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", ...argv]);
    return process.exitCode;
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    process.exitCode = before;
  }
}

async function runJson(argv: string[]): Promise<{ stdout: string; exitCode: number | undefined }> {
  const program = tree();
  const before = process.exitCode;
  process.exitCode = undefined;
  setJsonMode(true);
  const out: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.map((a) => String(a)).join(" "));
  });
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
    return { stdout: out.join("\n"), exitCode: process.exitCode };
  } finally {
    log.mockRestore();
    error.mockRestore();
    write.mockRestore();
    setJsonMode(false);
    process.exitCode = before;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  getSetupStatus.mockResolvedValue(READY);
  autoProvision.mockResolvedValue(READY);
});

/**
 * Both branches, driven identically.
 *
 * `--auto` reaches `autoProvision` and the plain read reaches `getSetupStatus` —
 * two SDK methods, one printer, and a cure applied to only one of them would
 * pass every case written for the other.
 */
const BRANCHES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["plain read", ["channel", "setup", "--type", "WHATSAPP"]],
  ["--auto", ["channel", "setup", "--type", "WHATSAPP", "--auto"]]
];

describe.each(BRANCHES)("nexus channel setup (%s)", (name, argv) => {
  const stub = (): ReturnType<typeof vi.fn> => (name === "--auto" ? autoProvision : getSetupStatus);

  it("exits NON-ZERO when ready is false", async () => {
    stub().mockResolvedValue(NOT_READY);

    expect(await run([...argv])).toBe(EXIT_CODES["remote-error"]);
  });

  it("still exits 0 when ready is true", async () => {
    stub().mockResolvedValue(READY);

    expect(await run([...argv])).toBeUndefined();
  });

  it("puts the ERROR document on stdout under --json when it refuses", async () => {
    // Printing the steps and THEN refusing takes stdout with a document that
    // parses cleanly and never says the channel is not ready — `error-masked`.
    stub().mockResolvedValue(NOT_READY);

    const { stdout, exitCode } = await runJson([...argv]);

    expect(exitCode).toBe(EXIT_CODES["remote-error"]);
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    expect((JSON.parse(stdout) as { error?: { code?: unknown } }).error?.code).toBe(
      "CLI_REMOTE_ERROR"
    );
  });

  it("carries the CHECKLIST and the blocking step's ACTION inside the refusal", async () => {
    // 🚨 A HINT THAT NAMES A FIELD THE DOCUMENT DOES NOT CARRY SENDS THE READER
    // TO NOTHING. The error document replaces `steps` under --json, so the
    // checklist moves into `message` and the first blocking step's action —
    // method, endpoint and hint text — moves into `hint`. Same defect and same
    // cure as `tool connection-status`, found there by review.
    stub().mockResolvedValue(NOT_READY);

    const { stdout } = await runJson([...argv]);
    const doc = JSON.parse(stdout) as { error: { message: string; hint: string } };

    expect(doc.error.message).toContain("WhatsApp Business Account");
    expect(doc.error.message).toContain("action_needed");
    // Every step, not only the blocking one: "what is the next thing to do" is
    // the blocking step, and "how far did I get" is the whole list.
    expect(doc.error.message).toContain("Messaging connection");
    expect(doc.error.hint).toContain("/api/public/v1/channels/whatsapp/connect");
    expect(doc.error.hint).toContain("Complete Meta embedded signup first.");
  });

  it("still puts the setup document, WITH `ready`, on stdout when it is ready", async () => {
    // The half that keeps this shippable, and the half `channel setup` already
    // had a gate for: `ready` must be IN the one document, because the shipped
    // `--help` recipe evaluates `.ready` against exactly this stdout.
    stub().mockResolvedValue(READY);

    const { stdout, exitCode } = await runJson([...argv]);

    expect(exitCode).toBeUndefined();
    expect(describeStdout(stdout)).toEqual({ documents: 1, prose: false });
    const doc = JSON.parse(stdout) as { ready?: unknown; steps?: unknown[]; error?: unknown };
    expect(doc.ready).toBe(true);
    expect(doc.steps).toHaveLength(READY.steps.length);
    expect(doc.error).toBeUndefined();
  });
});

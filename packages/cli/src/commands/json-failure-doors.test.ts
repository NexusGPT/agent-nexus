/**
 * CLAUSE 2, AT THE DOORS THE DRIVEN SCAN CANNOT OPEN.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS BESIDE `json-one-document.test.ts` RATHER THAN INSIDE IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The driven scan feeds every leaf a SYNTHESIZED argv and a self-similar stub
 * whose every field is truthy. That is the worst case for clause 1 — a truthy
 * field takes the `if` branch, which is the branch that prints a second
 * document — and it is the BEST case for clause 2, because the branches that
 * leave stdout empty are exactly the ones a truthy stub never reaches:
 *
 *   - an EQUALITY on a payload field (`result.status === "success"`), which a
 *     proxy cannot satisfy, so the scan lands in the else arm and calls it
 *     `silent` rather than a violation. The scan's own header says so.
 *   - a CONFIRMATION gate keyed on `isTTY`, which the synthesizer waves through
 *     by passing `--yes`.
 *   - a REMOVED-FLAG refusal, which the synthesizer never passes because it
 *     synthesizes values for flags the command still wants.
 *   - a `catch` around a real call, which the stub resolves instead of throwing.
 *
 * So `ERROR_LEDGER_CEILING = 0` is a true statement about the population the
 * scan can drive, and it is not a statement about the CLI. This file drives the
 * residue by hand: one named argv per door, chosen so the branch is decided
 * LOCALLY and the assertion cannot be satisfied by a network stub.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE INVARIANT UNDER TEST — THE SECOND HALF OF THE ROOT EPILOGUE'S PROMISE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * "EVERY failure exits 1. Under --json an error is a JSON document on STDOUT:
 * {"error":{"message","hint","code"}}."
 *
 * `printWarning` and `console.error` both write to STDERR ONLY. Paired with
 * `process.exitCode = 1` they produce the one combination no caller can work
 * around: a non-zero exit and an empty pipe. `jq` sees end-of-input and a shell
 * script cannot tell a refusal from a crash from a command that does not exist.
 *
 * ⚠️ THE CONTROL IS NOT DECORATION. `cloud-import google-drive list-files` with
 * no flags at all reaches `refuse()` and is COMPLIANT today. It runs through the
 * identical helper and assertion as every door below, so a red anywhere else is
 * the command and never the harness — without it, a broken capture would red
 * every case at once and read as six defects.
 */

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";

const { docsSearch, testExternalTool } = vi.hoisted(() => ({
  docsSearch: vi.fn(),
  testExternalTool: vi.fn()
}));

// Every command file imports `createClient` from this one module, so a single
// mock serves all six doors. Four of them never reach it: their branch is
// decided before the client is built, which is the property that makes them
// deterministic here.
vi.mock("../client", () => ({
  createClient: () => ({
    docs: { search: docsSearch },
    skills: { testExternalTool }
  })
}));

import { registerCloudImportCommands } from "./cloud-import";
import { registerCustomModelCommands } from "./custom-model";
import { registerDocsCommand } from "./docs";
import { registerExternalToolCommands } from "./external-tool";
import { registerVibeCommands } from "./vibe";
import { registerWorkspaceCommands } from "./workspace";

interface Driven {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
  /**
   * What the parse threw, if anything.
   *
   * 🚨 RECORDED RATHER THAN SWALLOWED, AND THE FIRST RUN OF THIS FILE IS WHY.
   * A bare `catch {}` turned a HARNESS fault — `--json` passed in argv to a
   * sub-program that registers no such option, so commander refused before any
   * action ran — into `exitCode: undefined` on all seven cases, which reads
   * exactly like seven commands that failed to exit 1. The control caught it;
   * this field is what NAMES it, so the next fault costs one read instead of a
   * bisect.
   */
  readonly threw: string | undefined;
}

/**
 * Drive one leaf under `--json` and return what each STREAM actually holds.
 *
 * Both channels are captured at BOTH spellings — `console.*` and the raw
 * `write` — because the two defect shapes use different ones: `console.error`
 * for a hand-rolled refusal, `process.stderr.write` for `printWarning`. Capture
 * only one and half the population reads as compliant.
 */
async function drive(
  register: (program: Command) => void,
  argv: readonly string[]
): Promise<Driven> {
  const program = new Command();
  program.name("nexus").exitOverride();
  register(program);

  // Also resets the `_documentEmitted` latch, so each door starts with stdout
  // unclaimed and one run cannot mask the next.
  setJsonMode(true);

  const out: string[] = [];
  const err: string[] = [];
  const realLog = console.log;
  const realErr = console.error;
  const realOutWrite = process.stdout.write.bind(process.stdout);
  const realErrWrite = process.stderr.write.bind(process.stderr);

  console.log = (...args: unknown[]): void => void out.push(args.map(String).join(" "));
  console.error = (...args: unknown[]): void => void err.push(args.map(String).join(" "));
  process.stdout.write = ((text: string | Uint8Array): boolean => {
    out.push(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    err.push(typeof text === "string" ? text : "");
    return true;
  }) as typeof process.stderr.write;

  const previous = process.exitCode;
  process.exitCode = undefined;
  let threw: string | undefined;

  try {
    // ⚠️ NO `--json` IN ARGV. JSON mode is process state set by `setJsonMode`
    // above; the FLAG is declared on the real root program, and these leaves are
    // registered onto a bare `Command` that has never heard of it. Passing it
    // here makes commander refuse the invocation before any action runs — which
    // is a harness fault wearing the exact shape of the defect under test.
    await program.parseAsync(["node", "nexus", ...argv]);
  } catch (error) {
    // A thrown action is DATA here — what each stream holds is the measurement.
    // But it is NAMED, so a harness fault cannot pass for a finding.
    threw = error instanceof Error ? error.message : String(error);
  } finally {
    console.log = realLog;
    console.error = realErr;
    process.stdout.write = realOutWrite;
    process.stderr.write = realErrWrite;
  }

  const exitCode = process.exitCode;
  process.exitCode = previous;

  return {
    stdout: out.join("\n").trim(),
    stderr: err.join("\n").trim(),
    exitCode: typeof exitCode === "number" ? exitCode : undefined,
    threw
  };
}

/**
 * A failure told the caller properly: exit 1, and ONE error document on stdout.
 *
 * `JSON.parse` over the whole of stdout is what rejects a second concatenated
 * document as well as prose, so this asserts both clauses at once rather than
 * only the one the door broke.
 */
function expectOneErrorDocument(run: Driven, door: string, hintMustMention?: string): void {
  // Asserted FIRST: a commander refusal of the harness's own argv reaches every
  // later assertion as an empty stdout, i.e. as the defect. This separates them.
  expect(run.threw, `${door}: the harness itself threw — this is not a finding`).toBeUndefined();
  // NON-ZERO, not 1. This helper drives doors whose categories differ — a
  // removed flag is `invalid-input` (5), a failed auth test is `remote-error`
  // (6). The subject here is the DOCUMENT on stdout; `exit-code-taxonomy.test.ts`
  // owns which number each category gets.
  expect(run.exitCode, `${door}: a failure must exit non-zero`).not.toBe(0);
  expect(
    run.stdout,
    `${door}: exited 1 with an EMPTY stdout — the caller has nothing to parse`
  ).not.toBe("");

  let parsed: unknown;
  expect(() => {
    parsed = JSON.parse(run.stdout);
  }, `${door}: stdout is not one JSON document`).not.toThrow();

  const error = (parsed as { error?: Record<string, unknown> }).error;
  expect(error, `${door}: stdout document carries no "error" key`).toBeDefined();
  expect(Object.keys(error ?? {}).sort(), `${door}: the error document's keys`).toEqual([
    "code",
    "hint",
    "message"
  ]);
  expect(typeof error?.message, `${door}: message must be a string`).toBe("string");
  expect(typeof error?.code, `${door}: code must be a string`).toBe("string");

  // 🚨 THE HINT MUST NAME THE REMEDY FOR *THIS* FAILURE, AND THE WRONG ONE READS
  // AS HELP. Caught by bugbot on this file's own first fix: `workspace delete`'s
  // refusal carried the `workspaces:delete` PERMISSION note lifted from its help
  // text, while the refusal is about a missing confirmation and happens before
  // anything is sent — so a script reading `hint` is sent to fix its API scopes
  // over a missing `--yes`. That is this PR's own thesis (a document exists so a
  // machine can branch on it, and a wrong label is worse than the prose it
  // replaced) reappearing one field to the right of `code`.
  //
  // Only the CONFIRMATION doors are asserted, because only they have a remedy a
  // string can name. Judging a free-text hint in general needs semantics; this
  // checks the one case where the correct answer is mechanical.
  if (hintMustMention !== undefined) {
    expect(
      String(error?.hint ?? ""),
      `${door}: the hint must name the remedy for THIS failure`
    ).toContain(hintMustMention);
  }
}

describe("under --json, a failure is a document on stdout — at the doors the scan cannot drive", () => {
  // Typed `boolean` by @types/node even though the runtime value is
  // `true | undefined`, so the holder matches the declared type rather than the
  // observed one — restoring `undefined` is exactly what a non-TTY run wants.
  let stdinWasTty: boolean;

  beforeEach(() => {
    docsSearch.mockReset();
    testExternalTool.mockReset();

    // The confirmation gates branch on this. Pinned rather than inherited: a
    // runner that happened to allocate a TTY would take the PROMPT arm and hang
    // or pass for the wrong reason, which is a vacuous green rather than a flake.
    stdinWasTty = process.stdin.isTTY;
    process.stdin.isTTY = false;
  });

  afterEach(() => {
    process.stdin.isTTY = stdinWasTty;
    setJsonMode(false);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE CONTROL. Compliant today, and it must stay green in every run above.
  // ───────────────────────────────────────────────────────────────────────────

  it("CONTROL: a compliant refusal reaches stdout, so a red below is the command", async () => {
    const run = await drive(registerCloudImportCommands, [
      "cloud-import",
      "google-drive",
      "list-files"
    ]);

    expectOneErrorDocument(run, "CONTROL cloud-import google-drive list-files (no flags)");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE TWO DOORS CURSOR BUGBOT NAMED ON PR #3624.
  // ───────────────────────────────────────────────────────────────────────────

  it("cloud-import google-drive list-files --access-token: the REMOVED-flag refusal", async () => {
    const run = await drive(registerCloudImportCommands, [
      "cloud-import",
      "google-drive",
      "list-files",
      "--access-token",
      "tok-1"
    ]);

    expectOneErrorDocument(run, "cloud-import google-drive list-files --access-token");
  });

  it("external-tool test-auth: a FAILED auth test is a failure, not a quiet exit 1", async () => {
    testExternalTool.mockResolvedValue({
      status: "failed",
      error: "invalid_grant",
      executionTimeMs: 12
    });

    const run = await drive(registerExternalToolCommands, [
      "external-tool",
      "test-auth",
      "ext-1",
      "--operation-id",
      "listItems"
    ]);

    expectOneErrorDocument(run, "external-tool test-auth (status !== success)");
    expect(run.stdout, "the document should carry the reason the platform gave").toContain(
      "invalid_grant"
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // THE SIBLINGS OF THE SAME SHAPE. Same defect, same file family, unflagged.
  // ───────────────────────────────────────────────────────────────────────────

  it("workspace delete: refusing without --yes in a script is a failure", async () => {
    const run = await drive(registerWorkspaceCommands, ["workspace", "delete", "ws-1"]);

    expectOneErrorDocument(run, "workspace delete (non-TTY, no --yes)", "--yes");
  });

  it("custom-model delete: the SHARED confirmDestructive helper, so this is N doors", async () => {
    const run = await drive(registerCustomModelCommands, ["custom-model", "delete", "cm-1"]);

    expectOneErrorDocument(run, "custom-model delete (util/confirm confirmDestructive)", "--yes");
  });

  it("vibe app delete: vibe's OWN confirmDestructive, which tests isJsonMode explicitly", async () => {
    const run = await drive(registerVibeCommands, ["vibe", "app", "delete", "app-1"]);

    expectOneErrorDocument(run, "vibe app delete (vibe-local confirmDestructive)", "--yes");
  });

  it("docs search: a thrown call is reported as a document, not as prose", async () => {
    docsSearch.mockRejectedValue(new Error("docs feed unreachable"));

    const run = await drive(registerDocsCommand, ["docs", "search", "webhooks"]);

    expectOneErrorDocument(run, "docs search (catch arm)");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * THE ADMIN TREE'S HUMAN CHANNEL SAID LESS THAN THE RESOURCE TREE'S, FROM ONE LINE.
 *
 * `handleAdminError` computed a `code`, handed it to its own `write`, and then
 * spent it only on the `--json` arm. The human arm was a hand-rolled
 * `process.stderr.write(\`\x1b[31m✗\x1b[0m ${message}\n\`)` — three disagreements
 * with `printCliError` in one statement, each of which these arms now refuse:
 *
 *   1. NO CODE. `errors.ts` prints `Error: <message> [<code>]` precisely so a
 *      user pasting terminal output into a bug report brings the machine-readable
 *      cause with them — and its own comment records eleven workflow codes that
 *      were dying at that function before it did. The admin spelling still died.
 *   2. NO HINT. `printCliError` prints a dim second line; this arm had no way to
 *      carry one at all, so `missingToken`'s remedy was smuggled inside the
 *      MESSAGE and reached the `--json` document as prose in the wrong field.
 *   3. RAW ESCAPES. It was the only `\x1b` in production outside the two guarded
 *      `color`/`banner` definitions, so `NO_COLOR=1 nexus admin … 2> log` wrote
 *      escape bytes into the log. The guard exists; this line went around it.
 *
 * ── Why the colour arms assert on BYTES ─────────────────────────────────────
 *
 * The defect is bytes reaching a file. A rendered-string comparison would be
 * satisfied by a string that merely *looks* plain, and the ESC that survives is
 * invisible in every diff and every test report. `0x1b` is asked for directly.
 *
 * ── Why the whole module is re-imported per case ────────────────────────────
 *
 * `NO_COLOR` in `output.ts` is a module-level `const` evaluated at import, so an
 * env stub set afterwards changes nothing. Each case therefore resets the module
 * registry and imports fresh — which also means `AdminCliError` must be minted
 * from the SAME fresh module, or `instanceof` inside `handleAdminError` fails
 * against a class from a previous registry and the error takes the generic arm.
 */

const ESC = 0x1b;

interface Emission {
  readonly text: string;
  readonly bytes: Buffer;
}

/**
 * Run `handleAdminError` on the HUMAN channel under a stated colour environment
 * and return every byte it wrote.
 *
 * Both sinks are captured, deliberately: the defect wrote through
 * `process.stderr.write` and the repair writes through `console.error`, so a
 * probe reading only one of them would report an empty channel for one of the
 * two trees and read as a finding either way.
 */
async function emitAdminFailure(
  mint: (module: typeof import("./admin-errors")) => unknown,
  env: { readonly noColor: boolean; readonly isTty: boolean }
): Promise<Emission> {
  vi.resetModules();
  vi.stubEnv("NO_COLOR", env.noColor ? "1" : "");

  const realIsTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", {
    value: env.isTty,
    configurable: true,
    writable: true
  });

  const chunks: string[] = [];
  const realError = console.error;
  const realStderrWrite = process.stderr.write.bind(process.stderr);
  console.error = (...args: unknown[]): void => void chunks.push(`${args.map(String).join(" ")}\n`);
  process.stderr.write = ((text: string | Uint8Array): boolean => {
    chunks.push(typeof text === "string" ? text : Buffer.from(text).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;

  try {
    const module = await import("./admin-errors");
    module.handleAdminError(mint(module));
    const text = chunks.join("");
    return { text, bytes: Buffer.from(text, "utf8") };
  } finally {
    console.error = realError;
    process.stderr.write = realStderrWrite;
    if (realIsTty === undefined) {
      delete (process.stdout as { isTTY?: boolean }).isTTY;
    } else {
      Object.defineProperty(process.stdout, "isTTY", realIsTty);
    }
  }
}

interface ErrorDocument {
  readonly error: { readonly message: string; readonly hint: string | null; readonly code: string };
}

/** The same call on the `--json` channel, with the one document parsed back. */
async function emitAdminDocument(
  mint: (module: typeof import("./admin-errors")) => unknown
): Promise<{ readonly document: ErrorDocument }> {
  vi.resetModules();
  vi.stubEnv("NO_COLOR", "1");

  const out: string[] = [];
  const realLog = console.log;
  console.log = (...args: unknown[]): void => void out.push(args.map(String).join(" "));

  try {
    const output = await import("../output");
    output.setJsonMode(true);
    const module = await import("./admin-errors");
    module.handleAdminError(mint(module));
    output.setJsonMode(false);
    return { document: JSON.parse(out.join("\n")) as ErrorDocument };
  } finally {
    console.log = realLog;
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the admin human channel says what the resource human channel says", () => {
  it("carries the diagnostic code, so a user can paste it into a bug report", async () => {
    const run = await emitAdminFailure(
      (module) => module.AdminCliError.fromStatus(403, "nope", "ADMIN_FORBIDDEN"),
      { noColor: true, isTty: false }
    );

    // CONTROL, first: an empty channel would satisfy nothing below for the right
    // reason, and would read identically to a code that is merely absent.
    expect(run.text).toContain("nope");

    expect(run.text).toContain("[ADMIN_FORBIDDEN]");
  });

  it("falls back to the admin provenance code when the server named none", async () => {
    const run = await emitAdminFailure((module) => module.AdminCliError.fromStatus(500, "boom"), {
      noColor: true,
      isTty: false
    });

    expect(run.text).toContain("[CLI_ADMIN_ERROR]");
  });

  it("carries the remedy as a HINT, not smuggled inside the message", async () => {
    // ⚠️ ASSERTED ON THE DOCUMENT, NOT ON THE RENDERED LINES, AND THE FIRST
    // SPELLING OF THIS ARM WAS VACUOUS FOR EXACTLY THAT REASON. A remedy
    // embedded in `message` after a `\n  ` renders as a second indented line —
    // byte-identical, on the human channel, to one printed as a hint. It passed
    // against the tree that had no hint at all. The `hint` FIELD is the one
    // place the two cannot look the same.
    const run = await emitAdminDocument((module) => module.AdminCliError.missingToken());

    expect(run.document.error.hint ?? "").toContain("Grab a Clerk JWT");
    expect(run.document.error.message).not.toContain("Grab a Clerk JWT");
  });

  it("writes NO escape byte when NO_COLOR is set, even at a terminal", async () => {
    const run = await emitAdminFailure(
      (module) => module.AdminCliError.fromStatus(403, "nope", "ADMIN_FORBIDDEN"),
      { noColor: true, isTty: true }
    );

    // BYTES, not a rendered string. `NO_COLOR=1 nexus admin … 2> log` writing
    // `1b 5b 33 31 6d` into the log is the entire defect, and an ESC is invisible
    // in every report that renders it.
    expect(run.bytes.includes(ESC)).toBe(false);
  });

  it("CONTROL — still colours at a terminal when NO_COLOR is unset", async () => {
    const run = await emitAdminFailure(
      (module) => module.AdminCliError.fromStatus(403, "nope", "ADMIN_FORBIDDEN"),
      { noColor: false, isTty: true }
    );

    // Without this, the arm above is satisfied by any code path that cannot
    // colour at all — including one that stopped writing anything.
    expect(run.bytes.includes(ESC)).toBe(true);
  });
});

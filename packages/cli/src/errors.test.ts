import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleError, printNotFound } from "./errors";
import { EXIT_CODES } from "./exit-codes";
import { setJsonMode } from "./output";

/** Capture everything the handler writes to stderr. */
function capture(err: unknown): { exitCode: number; output: string } {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  const exitCode = handleError(err);
  spy.mockRestore();
  return { exitCode, output: lines.join("\n") };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleError next steps", () => {
  // The API's message names the CONDITION and stops there, because the console
  // renders the same string. The command that resolves it is the terminal's own
  // affordance, so the CLI adds it — keyed off the code, not the prose.
  it("offers the provision command for a cluster-not-ready conflict", () => {
    const { exitCode, output } = capture(
      new NexusApiError(
        "VIBE_GIT_PROJECT_CLUSTER_NOT_READY",
        "Cannot create a git project: your organization has no dedicated Vibe cluster — a repository hosted by Nexus is created on your own cluster, so one must be provisioned first",
        409
      )
    );

    expect(exitCode).toBe(EXIT_CODES["invalid-input"]);
    // The API's own reason still leads — the hint never replaces it.
    expect(output).toContain("no dedicated Vibe cluster");
    expect(output).toContain("nexus apps cluster provision --region");
    // The alternative nobody guesses from the message alone: a project with its
    // own remote is cloned by the build and needs no cluster at all.
    expect(output).toContain("--git-url");
  });

  it("keys the hint off the code, so rewording the API's prose cannot drop it", () => {
    const { output } = capture(
      new NexusApiError("VIBE_GIT_PROJECT_CLUSTER_NOT_READY", "totally different wording", 409)
    );

    expect(output).toContain("nexus apps cluster provision --region");
  });

  it("leaves a conflict it has no next step for exactly as the API stated it", () => {
    const { output } = capture(
      new NexusApiError("VIBE_GIT_PROJECT_ALREADY_EXISTS", "name is already taken", 409)
    );

    expect(output).toContain("name is already taken");
    expect(output).not.toContain("nexus apps cluster provision");
  });

  /**
   * NEX-3715 — the 404 branch reads the table too.
   *
   * `access-card list --credential-id` is the pre-delete check `credential
   * delete --help` mandates, and the id a caller predictably pastes into it is
   * the TOOL-SCOPED one `nexus tool credentials` prints. Both ids are UUIDs and
   * both columns are headed `ID`. The route refuses that paste 404, correctly —
   * and the generic 404 line, "Run nexus <resource> list", sends the reader to
   * re-list the resource they already listed, so the refusal reads as "this
   * credential is gone" for an account that is alive under its other id.
   */
  it("explains a 404 whose real cause is the OTHER credential id space", () => {
    const { exitCode, output } = capture(
      new NexusApiError(
        "CREDENTIAL_ID_IS_TOOL_SCOPED",
        "Credential not found. '9f1b6a52-5f7e-4a2b-8d3c-1e4f7a90b2d5' is a tool-scoped credential id (the id \"tool credentials\" lists), not a unified credential id. The unified id for the same connected account is '0b7f1f4c-2c3a-4f2e-9a1d-6c9f0d5b8e21' — access cards are addressed by that one.",
        404
      )
    );

    expect(exitCode).toBe(EXIT_CODES["not-found"]);
    // The API's sentence still leads, and it is the half that names the id.
    expect(output).toContain("0b7f1f4c-2c3a-4f2e-9a1d-6c9f0d5b8e21");
    // What the terminal adds: which command prints which id.
    expect(output).toContain("nexus credential list");
    // And the conclusion this 404 must NOT be allowed to support.
    expect(output).toContain("NOT proof the credential is gone");
    // The generic line is displaced, not printed beside it.
    expect(output).not.toContain("nexus <resource> list");
  });

  it("leaves every other 404 on the generic line", () => {
    // The next-step table outranks the generic hint; it must not replace it for
    // the 404s that have no entry.
    const { output } = capture(new NexusApiError("AGENT_NOT_FOUND", "gone", 404));

    expect(output).toContain("nexus <resource> list");
    expect(output).not.toContain("nexus credential list");
  });
});

describe("NEX-2760: client-side timeout vs unreachable API", () => {
  // A timeout means WE stopped waiting — the server may still complete the
  // request. Reporting it as "Could not reach the Nexus API" sends the user
  // debugging their network instead of raising --timeout.
  it("reports a timeout as the CLI giving up, never as an unreachable API", () => {
    const { exitCode, output } = capture(new NexusTimeoutError(600_000));

    expect(exitCode).toBe(EXIT_CODES["timed-out"]);
    expect(output).not.toContain("Could not reach the Nexus API");
    expect(output).toContain("600s");
    expect(output).toContain("stopped waiting");
    expect(output).toContain("--timeout");
  });

  it("still reports a genuine connection failure as an unreachable API", () => {
    const { output } = capture(new NexusConnectionError("ECONNREFUSED"));

    expect(output).toContain("Could not reach the Nexus API");
    expect(output).not.toContain("--timeout");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The error CODE reaches the reader — on both channels.
// ═══════════════════════════════════════════════════════════════════════════

/** Capture stdout under --json, and the exit code. */
function captureJson(err: unknown): { exitCode: number; doc: CliError } {
  setJsonMode(true);
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  try {
    const exitCode = handleError(err);
    // Parsing is itself the "one JSON document" assertion — it rejects a prose
    // trailer and two concatenated values alike.
    return { exitCode, doc: JSON.parse(lines.join("\n")).error as CliError };
  } finally {
    spy.mockRestore();
    setJsonMode(false);
  }
}

interface CliError {
  message: string;
  hint: string | null;
  code: string;
}

/**
 * `handleError` read `err.code` twice — once to pick the VALIDATION_ERROR
 * wording, once through `nextStepsFor` — and passed it on never. So every
 * documented API error code, including all eleven workflow ones, died at
 * `printCliError` and reached no channel. The API emits them, the SDK carries
 * them on `NexusApiError.code`, and the CLI was the only link that dropped
 * them — a documented code existing everywhere except where anyone can read it.
 */
describe("an API error code reaches the reader", () => {
  const WORKFLOW_CODE = "WORKFLOW_NODE_EXECUTION_FAILED";

  it("survives to stdout under --json", () => {
    const { doc, exitCode } = captureJson(new NexusApiError(WORKFLOW_CODE, "Node 3 threw", 400));

    expect(doc.code).toBe(WORKFLOW_CODE);
    expect(doc.message).toContain("Node 3 threw");
    expect(exitCode).toBe(EXIT_CODES["invalid-input"]);
  });

  it("survives to stderr in plain output", () => {
    const { output } = capture(new NexusApiError(WORKFLOW_CODE, "Node 3 threw", 400));

    expect(output).toContain(WORKFLOW_CODE);
  });

  it("carries through each branch that reads it — 404, 422 and 409", () => {
    expect(captureJson(new NexusApiError("AGENT_NOT_FOUND", "gone", 404)).doc.code).toBe(
      "AGENT_NOT_FOUND"
    );
    expect(captureJson(new NexusApiError("VALIDATION_ERROR", "bad", 422)).doc.code).toBe(
      "VALIDATION_ERROR"
    );
    // The 409 branch also computes a next step from the code; it must forward
    // the code as well as consume it.
    expect(
      captureJson(new NexusApiError("VIBE_GIT_PROJECT_CLUSTER_NOT_READY", "no cluster", 409)).doc
    ).toMatchObject({ code: "VIBE_GIT_PROJECT_CLUSTER_NOT_READY" });
  });

  it("a provider 401 keeps its own code and does NOT say to run auth login", () => {
    // The consequence the code exists for. AUTH_EXPIRED is a Google Drive /
    // SharePoint / Notion connection, not the caller's API key — and while the
    // SDK flattened every 401 to UNAUTHORIZED, the CLI answered all of them
    // with "run nexus auth login", sending the user to fix the wrong credential.
    const { doc } = captureJson(
      new NexusAuthenticationError("Access token has expired", "AUTH_EXPIRED")
    );

    expect(doc.code).toBe("AUTH_EXPIRED");
    expect(doc.message).toContain("Access token has expired");
    expect(doc.hint).not.toContain('auth login" to re-authenticate');
    expect(doc.hint).toContain("Your API key is fine");
  });

  it.each(["AUTH_INVALID", "REAUTH_REQUIRED"])(
    "%s gets the reconnect hint, not the re-authenticate one",
    (code) => {
      const { doc } = captureJson(new NexusAuthenticationError("nope", code));

      expect(doc.code).toBe(code);
      expect(doc.hint).toContain("Reconnect that integration");
    }
  );

  it("a genuine bad-key 401 still gets the auth login hint", () => {
    // The guard must not invert: UNAUTHORIZED is the caller's own key, and
    // "nexus auth login" is exactly right for it.
    const { doc } = captureJson(new NexusAuthenticationError());

    expect(doc.code).toBe("UNAUTHORIZED");
    expect(doc.hint).toContain("nexus auth login");
    expect(doc.message).toContain("invalid or missing API key");
  });

  it("names no command for reconnecting, because none exists", () => {
    // `nexus cloud-import providers` says its own connections "come from the
    // app". Inventing a verb here would replace one wrong hint with another.
    const { doc } = captureJson(new NexusAuthenticationError("gone", "REAUTH_REQUIRED"));

    expect(doc.hint).not.toMatch(/nexus [a-z-]+ (reconnect|connect)/);
  });

  it("passes UNAUTHORIZED through rather than inventing a CLI code", () => {
    // NexusAuthenticationError EXTENDS NexusApiError and is constructed with a
    // real code. Minting a CLI_* one here would discard a server fact.
    expect(captureJson(new NexusAuthenticationError()).doc.code).toBe("UNAUTHORIZED");
  });
});

/**
 * The document is ONE shape. Every key is always present, so a consumer never
 * writes a presence check — see `CliErrorDocument` in `errors.ts` for why `code`
 * is required rather than optional.
 */
describe("the error document is one shape on every failure", () => {
  const KEYS = ["message", "hint", "code"];

  const failures: [string, unknown][] = [
    ["api error", new NexusApiError("SOME_CODE", "boom", 500)],
    ["404", new NexusApiError("NOT_FOUND", "gone", 404)],
    ["auth", new NexusAuthenticationError()],
    ["timeout", new NexusTimeoutError(30_000)],
    ["connection", new NexusConnectionError("offline")],
    ["plain error", new Error("something")],
    ["non-error throw", "a bare string"]
  ];

  it.each(failures)("%s carries all three keys, and code is never empty", (_label, err) => {
    const { doc, exitCode } = captureJson(err);

    expect(Object.keys(doc).sort()).toEqual([...KEYS].sort());
    expect(typeof doc.code).toBe("string");
    expect(doc.code.length).toBeGreaterThan(0);
    expect(exitCode).not.toBe(0);
  });

  it("uses null for an absent hint, never an omitted key", () => {
    // The old shape omitted the key entirely, because JSON.stringify drops an
    // undefined value — so the document really was two shapes while claiming one.
    const { doc } = captureJson(new NexusApiError("SOME_CODE", "boom", 500));

    expect(doc.hint).toBeNull();
    expect("hint" in doc).toBe(true);
  });

  it("prefixes a CLI-side failure with CLI_, so provenance is readable", () => {
    // The prefix is what lets `code` be required without lying: these never
    // reached the server, and no server code can ever collide with them.
    expect(captureJson(new NexusTimeoutError(30_000)).doc.code).toBe("CLI_TIMEOUT");
    expect(captureJson(new NexusConnectionError("offline")).doc.code).toBe("CLI_CONNECTION_FAILED");
    expect(captureJson(new Error("x")).doc.code).toBe("CLI_UNKNOWN_ERROR");
  });

  it("printNotFound defaults to CLI_NOT_FOUND — the CLI read a 2xx, not the server", () => {
    setJsonMode(true);
    const lines: string[] = [];
    const spy = vi
      .spyOn(console, "log")
      .mockImplementation((l: unknown) => void lines.push(String(l)));
    let exitCode: number;
    try {
      exitCode = printNotFound("No customer with that external id.", "Try customer list.");
    } finally {
      spy.mockRestore();
      setJsonMode(false);
    }

    const doc = JSON.parse(lines.join("\n")).error as CliError;
    expect(doc).toEqual({
      message: "No customer with that external id.",
      hint: "Try customer list.",
      code: "CLI_NOT_FOUND"
    });
    expect(exitCode).toBe(EXIT_CODES["not-found"]);
  });
});

import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "@agent-nexus/sdk";
import { describe, expect, it } from "vitest";

import { handleError, printNotFound, refuse, reportFailure } from "./errors";
import {
  CategorizedCliError,
  EXIT_CODES,
  exitCodeForHttpStatus,
  isDeclaredExitCode
} from "./exit-codes";
import { AdminCliError, handleAdminError } from "./util/admin-errors";

/**
 * EACH CAUSE OF FAILURE MAPS TO ITS DECLARED CATEGORY, ON BOTH TREES.
 *
 * The cases here drive the real mappers: the one HTTP rule, `handleError`, the
 * resource tree's own verbs, and the admin tree's `handleAdminError`. Whether
 * the taxonomy itself is declared once, reachable, and never bypassed by an
 * integer literal is `exit-code-taxonomy.test.ts`.
 */

describe("the HTTP rule is one function, and both trees read it", () => {
  it("maps 401 to not-authenticated", () => {
    expect(exitCodeForHttpStatus(401)).toBe(EXIT_CODES["not-authenticated"]);
  });
  it("maps 403 to permission-denied", () => {
    expect(exitCodeForHttpStatus(403)).toBe(EXIT_CODES["permission-denied"]);
  });
  it("maps 404 to not-found", () => {
    expect(exitCodeForHttpStatus(404)).toBe(EXIT_CODES["not-found"]);
  });
  it("maps 400, 409 and 422 to invalid-input", () => {
    expect(exitCodeForHttpStatus(400)).toBe(EXIT_CODES["invalid-input"]);
    expect(exitCodeForHttpStatus(409)).toBe(EXIT_CODES["invalid-input"]);
    expect(exitCodeForHttpStatus(422)).toBe(EXIT_CODES["invalid-input"]);
  });
  it("maps 500 and 503 to remote-error", () => {
    expect(exitCodeForHttpStatus(500)).toBe(EXIT_CODES["remote-error"]);
    expect(exitCodeForHttpStatus(503)).toBe(EXIT_CODES["remote-error"]);
  });
  it("maps a status it does not name to the generic failure, never to a guess", () => {
    expect(exitCodeForHttpStatus(418)).toBe(EXIT_CODES.failed);
  });
});

describe("handleError returns a declared code on every branch", () => {
  const declared = (code: number): void => {
    expect({ code, declared: isDeclaredExitCode(code) }).toEqual({ code, declared: true });
  };

  it("a 401 exits not-authenticated", () => {
    const code = handleError(new NexusAuthenticationError("nope", "UNAUTHORIZED"));
    declared(code);
    expect(code).toBe(EXIT_CODES["not-authenticated"]);
  });

  it("a 403 exits permission-denied", () => {
    const code = handleError(new NexusApiError("FORBIDDEN", "nope", 403));
    declared(code);
    expect(code).toBe(EXIT_CODES["permission-denied"]);
  });

  it("a 404 exits not-found", () => {
    const code = handleError(new NexusApiError("NOT_FOUND", "gone", 404));
    declared(code);
    expect(code).toBe(EXIT_CODES["not-found"]);
  });

  it("a 422 exits invalid-input", () => {
    const code = handleError(new NexusApiError("VALIDATION_ERROR", "bad", 422));
    declared(code);
    expect(code).toBe(EXIT_CODES["invalid-input"]);
  });

  it("a 500 exits remote-error", () => {
    const code = handleError(new NexusApiError("INTERNAL", "boom", 500));
    declared(code);
    expect(code).toBe(EXIT_CODES["remote-error"]);
  });

  it("an unreachable API exits connection-failed, which is the retryable one", () => {
    const code = handleError(new NexusConnectionError("offline"));
    declared(code);
    expect(code).toBe(EXIT_CODES["connection-failed"]);
  });

  it("a client-side timeout exits timed-out, NOT connection-failed", () => {
    // The distinction is load-bearing: the server may still be completing the
    // request, so a blind retry of a write can duplicate it.
    const code = handleError(new NexusTimeoutError(30_000));
    declared(code);
    expect(code).toBe(EXIT_CODES["timed-out"]);
    expect(code).not.toBe(EXIT_CODES["connection-failed"]);
  });

  it("an SDK error with no category exits the generic failure", () => {
    const code = handleError(new NexusError("something"));
    declared(code);
    expect(code).toBe(EXIT_CODES.failed);
  });

  it("a plain Error exits the generic failure", () => {
    const code = handleError(new Error("unexpected"));
    declared(code);
    expect(code).toBe(EXIT_CODES.failed);
  });

  it("a non-Error throw exits the generic failure", () => {
    const code = handleError("a string nobody should have thrown");
    declared(code);
    expect(code).toBe(EXIT_CODES.failed);
  });

  it("an error carrying its own category exits that category", () => {
    const code = handleError(
      new CategorizedCliError("not-authenticated", "CLI_NOT_AUTHENTICATED", "log in")
    );
    declared(code);
    expect(code).toBe(EXIT_CODES["not-authenticated"]);
  });
});

describe("the resource tree's own verbs decide a category, not a constant", () => {
  it("refuse() exits invalid-input", () => {
    expect(refuse("--body is required.")).toBe(EXIT_CODES["invalid-input"]);
  });

  it("printNotFound() exits not-found", () => {
    expect(printNotFound("no such customer")).toBe(EXIT_CODES["not-found"]);
  });

  it("reportFailure(not-found) exits not-found", () => {
    expect(reportFailure("not-found", "no profile")).toBe(EXIT_CODES["not-found"]);
  });
  it("reportFailure(not-authenticated) exits not-authenticated", () => {
    expect(reportFailure("not-authenticated", "log in")).toBe(EXIT_CODES["not-authenticated"]);
  });
  it("reportFailure(connection-failed) exits connection-failed", () => {
    expect(reportFailure("connection-failed", "offline")).toBe(EXIT_CODES["connection-failed"]);
  });
  it("reportFailure(timed-out) exits timed-out", () => {
    expect(reportFailure("timed-out", "gave up")).toBe(EXIT_CODES["timed-out"]);
  });
  it("reportFailure(remote-error) exits remote-error", () => {
    expect(reportFailure("remote-error", "500")).toBe(EXIT_CODES["remote-error"]);
  });
  it("reportFailure(local-failed) exits local-failed", () => {
    expect(reportFailure("local-failed", "write failed")).toBe(EXIT_CODES["local-failed"]);
  });
});

describe("the admin tree reads the same taxonomy it used to own", () => {
  it("a missing admin token exits not-authenticated", () => {
    expect(handleAdminError(AdminCliError.missingToken())).toBe(EXIT_CODES["not-authenticated"]);
  });

  it("a CLI-side validation refusal exits invalid-input", () => {
    expect(handleAdminError(AdminCliError.localValidation("--reason required"))).toBe(
      EXIT_CODES["invalid-input"]
    );
  });

  it("an unreachable admin API exits connection-failed", () => {
    expect(handleAdminError(AdminCliError.network("ECONNREFUSED"))).toBe(
      EXIT_CODES["connection-failed"]
    );
  });

  it("an admin deadline exits timed-out — the same number as the resource tree", () => {
    // The admin tree used to route a deadline through `network`, so it exited 7
    // while the resource tree exited 8 for the same fact. Every non-GET through
    // `adminRequest` is a WRITE, and 7 tells a script the request never arrived.
    const admin = handleAdminError(AdminCliError.timedOut("no response within 30000 ms"));
    const resource = handleError(new NexusTimeoutError(30_000));
    expect(admin).toBe(resource);
    expect(admin).toBe(EXIT_CODES["timed-out"]);
  });

  it("CONTROL — and it is NOT connection-failed, which is the number it used to take", () => {
    expect(handleAdminError(AdminCliError.timedOut("no response within 30000 ms"))).not.toBe(
      EXIT_CODES["connection-failed"]
    );
  });

  it("a 403 from the admin API exits permission-denied — the same number as the resource tree", () => {
    const admin = handleAdminError(AdminCliError.fromStatus(403, "nope"));
    const resource = handleError(new NexusApiError("FORBIDDEN", "nope", 403));
    expect(admin).toBe(resource);
    expect(admin).toBe(EXIT_CODES["permission-denied"]);
  });

  it("a 500 from the admin API exits remote-error — the same number as the resource tree", () => {
    const admin = handleAdminError(AdminCliError.fromStatus(500, "boom"));
    const resource = handleError(new NexusApiError("INTERNAL", "boom", 500));
    expect(admin).toBe(resource);
    expect(admin).toBe(EXIT_CODES["remote-error"]);
  });

  it("an unexpected admin throw exits the generic failure", () => {
    expect(handleAdminError(new Error("weird"))).toBe(EXIT_CODES.failed);
  });
});

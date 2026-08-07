import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

import { color, isJsonMode } from "./output";

/**
 * Handle errors from SDK calls and print actionable messages.
 * Returns the exit code to use.
 */
/**
 * What the CLI can offer for a specific API error code.
 *
 * The API's message names the CONDITION in surface-neutral terms, because the
 * console renders the very same string — a message that said "run nexus ..."
 * would name a control a browser user does not have. The command that resolves
 * it therefore belongs here, on the surface that knows the reader is in a
 * terminal. Keyed by the error CODE, never by message text, so rewording the
 * API's prose cannot silently drop the next step.
 */
const NEXT_STEPS_BY_CODE: Record<string, string> = {
  // The org has no dedicated cluster (or its cluster cannot host code). Two
  // ways forward, and the second is the one nobody guesses: a project that
  // carries its own remote is cloned straight from there by the build and
  // never needs a cluster at all.
  VIBE_GIT_PROJECT_CLUSTER_NOT_READY: [
    "Provision your cluster (EU regions, immutable once set):",
    "  nexus vibe cluster provision --region eu-west-3",
    "  nexus vibe cluster status",
    "",
    "Or host the code yourself — no cluster needed, the build clones your remote:",
    "  nexus vibe app provision-repo <appId> --git-url https://github.com/acme/svc.git"
  ].join("\n")
};

/**
 * The CLI-actionable next step for an API error, or null when we have nothing
 * better to say than the API already did. A code the API sends but this table
 * does not know is not an error — the caller still gets the API's message.
 */
function nextStepsFor(err: NexusApiError): string | null {
  return NEXT_STEPS_BY_CODE[err.code] ?? null;
}

export function handleError(err: unknown): number {
  if (err instanceof NexusAuthenticationError) {
    printCliError(
      "Authentication failed — invalid or missing API key.",
      'Run "nexus auth login" to re-authenticate, or set NEXUS_API_KEY.'
    );
    return 1;
  }

  if (err instanceof NexusApiError) {
    if (err.status === 404) {
      printCliError(
        `Not found: ${err.message}`,
        'Run "nexus <resource> list" to see available resources.'
      );
    } else if (err.status === 422 || err.code === "VALIDATION_ERROR") {
      printCliError(
        `Validation error: ${err.message}`,
        err.details ? `Details: ${JSON.stringify(err.details)}` : undefined
      );
    } else if (err.status === 409) {
      printCliError(
        `Conflict: ${err.message}`,
        nextStepsFor(err) ?? (err.details ? `Details: ${JSON.stringify(err.details)}` : undefined)
      );
    } else {
      printCliError(`API error (${err.status}): ${err.message}`);
    }
    return 1;
  }

  // Before NexusConnectionError — a timeout IS a connection error in the SDK's
  // hierarchy, but "we stopped waiting" must not read as "the API was down":
  // the server may still be processing (and completing) the request.
  if (err instanceof NexusTimeoutError) {
    const seconds = Math.round(err.timeoutMs / 1000);
    printCliError(
      `The request was still running after ${seconds}s, so the CLI stopped waiting (client-side timeout — the server may still complete it).`,
      "For long-running operations, raise the limit with the global --timeout <seconds> flag."
    );
    return 1;
  }

  if (err instanceof NexusConnectionError) {
    printCliError(
      "Could not reach the Nexus API.",
      "Check your network connection and base URL configuration."
    );
    return 1;
  }

  if (err instanceof NexusError) {
    printCliError(err.message);
    return 1;
  }

  if (err instanceof Error) {
    printCliError(err.message);
    return 1;
  }

  printCliError(String(err));
  return 1;
}

function printCliError(message: string, hint?: string): void {
  if (isJsonMode()) {
    console.log(JSON.stringify({ error: { message, hint } }, null, 2));
    return;
  }

  console.error(color.red("Error:") + " " + message);
  if (hint) {
    console.error(color.dim("  " + hint));
  }
}

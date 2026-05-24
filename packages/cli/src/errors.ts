import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusError
} from "@agent-nexus/sdk";

import { color, isJsonMode } from "./output";

/**
 * Handle errors from SDK calls and print actionable messages.
 * Returns the exit code to use.
 */
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
    } else {
      printCliError(`API error (${err.status}): ${err.message}`);
    }
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

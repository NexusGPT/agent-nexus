import { InvalidArgumentError } from "commander";

import { MAX_TIMEOUT_SECONDS } from "../../../client";
import { MAX_AWAIT_SECONDS } from "./wait-timings";

/** Parser for `--wait-timeout <seconds>`. Same ceiling as the global `--timeout`. */
export function parseWaitSeconds(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("--wait-timeout must be a positive number of seconds.");
  }
  if (parsed > MAX_TIMEOUT_SECONDS) {
    throw new InvalidArgumentError(
      `--wait-timeout must be at most ${MAX_TIMEOUT_SECONDS} seconds.`
    );
  }
  return parsed;
}

/** Parser for `await-thread --wait-timeout <seconds>`, which caps far lower than the poll's. */
export function parseAwaitSeconds(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_AWAIT_SECONDS) {
    throw new InvalidArgumentError(
      `--wait-timeout must be a whole number of seconds between 1 and ${MAX_AWAIT_SECONDS}.`
    );
  }
  return parsed;
}

/** Parser for `await-thread --after-message-count <n>`. */
export function parseAfterMessageCount(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError("--after-message-count must be a whole number of 0 or more.");
  }
  return parsed;
}

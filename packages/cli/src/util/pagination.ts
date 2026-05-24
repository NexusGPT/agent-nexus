import type { Command } from "commander";

/**
 * Add standard pagination options to a command.
 */
export function addPaginationOptions(cmd: Command): Command {
  return cmd
    .option("--page <number>", "Page number", parseInt)
    .option("--limit <number>", "Items per page", parseInt);
}

/**
 * Extract pagination params from parsed options.
 */
export function getPaginationParams(opts: Record<string, unknown>): {
  page?: number;
  limit?: number;
} {
  const params: { page?: number; limit?: number } = {};
  if (typeof opts.page === "number") params.page = opts.page;
  if (typeof opts.limit === "number") params.limit = opts.limit;
  return params;
}

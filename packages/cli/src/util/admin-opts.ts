/**
 * The seam between commander's option tree and the admin HTTP transport.
 *
 * `--admin-token` is declared once on the `admin` command rather than on each
 * subcommand, while `--base-url` and `--profile` are program-level globals. So
 * building an `AdminHttpOptions` means reading from two different nodes of the
 * command tree, and every admin subcommand needs the same merge.
 *
 * It lives here rather than in the `admin` entry module because all nine
 * command groups import it: exporting it from the entry point would make each
 * group import the module that imports it, for a cycle that buys nothing.
 */

import type { Command } from "commander";

import type { AdminHttpOptions } from "./admin-http";

/**
 * Merge globals from the program (--base-url, --profile) with admin-level
 * options (--admin-token). Subcommands then pass this into `adminRequest`.
 */
export function resolveAdminOpts(program: Command, admin: Command): AdminHttpOptions {
  const globals = program.optsWithGlobals();
  const adminOpts = admin.opts();
  return {
    adminToken: adminOpts.adminToken as string | undefined,
    baseUrl: globals.baseUrl as string | undefined,
    profile: globals.profile as string | undefined
  };
}

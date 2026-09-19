import { Command } from "commander";

import { timeoutSecondsToMs } from "../../../client";
import { type TenantHttpOptions } from "../../../util/tenant-http";

export function resolveTenantOpts(program: Command): TenantHttpOptions {
  const globals = program.optsWithGlobals();
  return {
    apiKey: globals.apiKey as string | undefined,
    baseUrl: globals.baseUrl as string | undefined,
    profile: globals.profile as string | undefined,
    timeout: timeoutSecondsToMs(globals.timeout as number | undefined)
  };
}

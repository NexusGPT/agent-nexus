import { handleError } from "../../../errors";
import {
  buildConfigBlock,
  buildServerEntry,
  defaultHome,
  type McpClient,
  resolveClientTarget
} from "../../../util/mcp-client-config";
import { applyConfigBlock } from "./apply-config-block";
import { printConfigBlock } from "./print-config-block";
import { type McpInstallGlobals, resolvePinnedProfile } from "./resolve-pinned-profile";

export interface McpInstallOpts {
  client: McpClient;
  name: string;
  apply?: boolean;
  force?: boolean;
  pin: boolean;
}

/**
 * `nexus mcp install`'s whole body, so the registrar is option declarations and
 * nothing else.
 *
 * The pin is resolved BEFORE the target is used for anything, because a refused
 * pin must leave the host's config untouched — and `--apply` is the one branch
 * here that writes.
 */
export async function runMcpInstall(
  opts: McpInstallOpts,
  globals: McpInstallGlobals
): Promise<void> {
  try {
    const target = resolveClientTarget(opts.client, {
      cwd: process.cwd(),
      home: defaultHome(),
      platform: process.platform
    });

    const pinned = resolvePinnedProfile(opts.pin, globals);
    if (pinned.refused) return;

    const entry = buildServerEntry({ profile: pinned.profile, baseUrl: globals.baseUrl });
    const block = buildConfigBlock(opts.name, entry);

    if (!opts.apply) {
      printConfigBlock(opts.client, target, block);
      return;
    }

    applyConfigBlock(opts.client, target, opts.name, entry, opts.force === true);
  } catch (err) {
    process.exitCode = handleError(err);
  }
}

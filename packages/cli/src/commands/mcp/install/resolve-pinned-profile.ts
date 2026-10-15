import { resolveProfile } from "../../../config";
import { refuse } from "../../../errors";

/** The globals `mcp install` reads: exactly `resolveProfile`'s own option bag. */
export interface McpInstallGlobals {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}

/**
 * Which profile the emitted block pins, or a refusal.
 *
 * 🚨 THE TWO OUTCOMES ARE NOT "a name" AND "no name". `{ profile: undefined }`
 * is the legitimate `--no-pin` answer — a block that follows the ACTIVE profile
 * at launch — while `{ refused: true }` means the exit code is already set and
 * the caller must return without writing anything. Collapsing them would emit
 * an unpinned block for an invocation that was refused.
 */
export function resolvePinnedProfile(
  pin: boolean,
  globals: McpInstallGlobals
): { refused: true } | { refused: false; profile: string | undefined } {
  if (!pin) return { refused: false, profile: undefined };

  const resolved = resolveProfile(globals);
  if (resolved.source === "override") {
    process.exitCode = refuse(
      "There is no profile to pin: this invocation is running on an --api-key / NEXUS_API_KEY override.",
      "Name one with --profile <name>, or pass --no-pin to emit a block that follows whatever profile is active when the host launches it."
    );
    return { refused: true };
  }
  return { refused: false, profile: resolved.name };
}

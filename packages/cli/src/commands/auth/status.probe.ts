import {
  AUTH_PROBE_DEFAULT_TIMEOUT_MS,
  type CredentialProbe,
  probeCredential,
  type ProbeRefusal,
  refusalForProbe
} from "../../auth-probe";
import { timeoutSecondsToMs } from "../../client";
import type { ResolvedProfile } from "../../config";

/**
 * The live half of `nexus auth status`: run the probe unless `--no-verify`, and
 * turn a failed one into the refusal it means. Both values are returned because
 * the two renderings place the refusal differently — the JSON document replaces
 * itself with it, the human channel prints the resolution first and the verdict
 * after.
 */
export async function verifyStatusCredential(
  options: { verify: boolean },
  globals: { timeout?: number },
  baseUrl: string,
  resolved: ResolvedProfile
): Promise<{ probe: CredentialProbe | null; refusal: ProbeRefusal | null }> {
  // ── The verification ────────────────────────────────────────────
  //
  // 🚨 THIS IS THE WHOLE POINT OF THE COMMAND, AND IT USED NOT TO HAPPEN.
  //
  // `auth status` read local config, found a key and exited 0 — over a key
  // the API had already stopped accepting. A sweep gated its preflight on
  // that exit code, passed, and then watched 63 of 69 calls fail on auth.
  // A verb named `status` that cannot fail on the state it reports turns a
  // one-command fix into an open-ended hunt.
  //
  // `--no-verify` keeps the old local-only read for the cases that need it
  // — offline, or inspecting a profile for a host you cannot reach. It is
  // OPT-IN, because the default has to be the honest answer.
  const probe = options.verify
    ? await probeCredential(baseUrl, resolved.profile.apiKey, {
        // The converter is named AT the call site on purpose: it is the one
        // place the unit changes, and the timeout gate reads this text to
        // prove the deadline is milliseconds and that the global flag can
        // still move it. A probe pinning its own deadline would make the
        // CLI's own "raise --timeout" advice a false instruction.
        signal: AbortSignal.timeout(
          timeoutSecondsToMs(globals.timeout) ?? AUTH_PROBE_DEFAULT_TIMEOUT_MS
        )
      })
    : null;
  const refusal =
    probe === null
      ? null
      : refusalForProbe(
          probe,
          resolved.name,
          baseUrl,
          // THIS verb declares `--no-verify`, so it may name it. `whoami`
          // does not and passes `null` — a shared hint naming a flag the
          // calling command lacks sends the reader to a commander error.
          "re-run with --no-verify"
        );

  return { probe, refusal };
}

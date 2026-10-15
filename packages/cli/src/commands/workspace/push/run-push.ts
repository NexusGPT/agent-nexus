import type { Command } from "commander";

import { createClient } from "../../../client";
import { refuse } from "../../../errors";
import { printEnvelope } from "../../../output";
import { sharedWorkspaceId } from "../../workspace-mount/shared-workspace-id";
import { remotePathRefusal } from "../../workspace-remote-path";
import { exitFor } from "./exit-for";
import { mergeResponses } from "./merge-responses";
import { packEntries } from "./pack-entries";
import { parseDestination } from "./parse-destination";
import { planPush } from "./plan-push";
import { pushPacks } from "./push-packs";
import { missingSource, refusePlan } from "./refuse-plan";
import { renderOutcome } from "./render-outcome";

/** Everything `nexus workspace push` reads off the command line. */
export interface PushOptions {
  /** Commander's `--no-clobber` sets this to false; the default true means "replace like cp". */
  clobber: boolean;
  includeHidden?: boolean;
  shared?: boolean;
}

export async function runPush(
  destination: string,
  sources: string[],
  opts: PushOptions,
  program: Command
): Promise<number> {
  const { slug, prefix } = parseDestination(destination);
  const prefixRefusal = prefix === "" ? null : remotePathRefusal(prefix);
  if (prefixRefusal !== null) {
    return refuse(`Destination folder "${prefix}" is not a workspace path: ${prefixRefusal}`);
  }
  const missing = missingSource(sources);
  if (missing !== undefined) return refuse(`No such file or folder: ${missing}`);

  const plan = planPush(sources, prefix, !!opts.includeHidden);
  const refused = refusePlan(plan);
  if (refused !== null) return refused;

  const client = createClient(program.optsWithGlobals());
  const workspaceId = opts.shared ? await sharedWorkspaceId(client, slug) : undefined;
  const outcomes = await pushPacks(client, slug, packEntries(plan.entries), {
    workspaceId,
    noClobber: !opts.clobber
  });
  const merged = mergeResponses(outcomes.map((outcome) => outcome.response));
  printEnvelope(merged, () => renderOutcome(slug, merged, plan));
  return exitFor(
    merged,
    outcomes.reduce((sum, outcome) => sum + outcome.localFailures, 0)
  );
}

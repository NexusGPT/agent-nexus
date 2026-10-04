import type { UpdateAgentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError, refuse } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import { resolveInputValue } from "../../util/stdin";
import {
  agentUpdateModelFields,
  CUSTOM_MODEL_ID_NEEDS_PAIR_HINT,
  CUSTOM_MODEL_ID_NEEDS_PAIR_MESSAGE,
  customModelIdNeedsThePair
} from "./update.model-config";

/** Everything `nexus agent update` reads off the command line. */
export interface AgentUpdateOptions {
  firstName?: string;
  lastName?: string;
  role?: string;
  bio?: string;
  shortBio?: string;
  model?: string;
  modelName?: string;
  modelProvider?: string;
  customModelId?: string;
  prompt?: string;
  /** Commander's `--no-publish`: `true` by default, `false` only when typed. */
  publish?: boolean;
  body?: string;
}

/** The `nexus agent update` action. */
export async function runAgentUpdate(
  program: Command,
  id: string,
  opts: AgentUpdateOptions
): Promise<void> {
  try {
    const globals = program.optsWithGlobals();
    const client = createClient(globals);

    const base = await resolveBody(opts.body);
    const flags: Record<string, unknown> = {};
    if (opts.firstName !== undefined) flags.firstName = opts.firstName;
    if (opts.lastName !== undefined) flags.lastName = opts.lastName;
    if (opts.role !== undefined) flags.role = opts.role;
    if (opts.bio !== undefined) flags.bio = opts.bio;
    if (opts.shortBio !== undefined) flags.shortBio = opts.shortBio;
    if (opts.model !== undefined) flags.model = opts.model;
    if (customModelIdNeedsThePair(opts)) {
      process.exitCode = refuse(
        CUSTOM_MODEL_ID_NEEDS_PAIR_MESSAGE,
        CUSTOM_MODEL_ID_NEEDS_PAIR_HINT
      );
      return;
    }

    Object.assign(flags, agentUpdateModelFields(opts));
    if (opts.prompt) flags.prompt = await resolveInputValue(opts.prompt);
    // ONLY when the operator TYPED --no-publish. Commander gives `publish`
    // the default `true`, and there is no `--publish` to distinguish "the
    // default" from "asked for". Setting the field unconditionally would
    // therefore let the default override an explicit
    // --body '{"autoPublish":false}', which is the trap this whole change
    // exists to close, re-introduced one layer up.
    if (opts.publish === false) flags.autoPublish = false;

    const body = mergeBodyWithFlags(base, flags);

    const agent = await client.agents.update(id, asRequestBody<UpdateAgentBody>(body));

    // THE VERDICT NAMES THE PUBLISH, because the write is silent otherwise.
    // A prompt edit reaching live customer conversations with the operator
    // believing it was staged is the failure this command shipped with; a
    // 200 and a bare id cannot tell the two outcomes apart. Read off the
    // merged body, never off `opts` — --body carries both fields too.
    const sentPrompt = body.prompt !== undefined;
    const published = body.autoPublish !== false;
    printSuccess(
      sentPrompt
        ? published
          ? "Agent updated. Prompt PUBLISHED — live on every deployment."
          : "Agent updated. Prompt written to the draft, NOT published."
        : "Agent updated.",
      {
        id: agent.id,
        ...(sentPrompt && { promptPublished: published }),
        dashboardUrl: dashboardUrlFor("agent", agent.id, globals)
      }
    );
  } catch (err) {
    process.exitCode = handleError(err);
  }
}

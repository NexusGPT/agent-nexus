import { Command } from "commander";

import { registerAgentSkillAddPresetCommand } from "./agent-skill/add-preset.command";
import { registerAgentSkillCreateCommand } from "./agent-skill/create.command";
import { registerAgentSkillDeleteCommand } from "./agent-skill/delete.command";
import { registerAgentSkillDownloadCommand } from "./agent-skill/download.command";
import { registerAgentSkillGetCommand } from "./agent-skill/get.command";
import { registerAgentSkillListCommand } from "./agent-skill/list.command";
import { registerAgentSkillPresetsCommand } from "./agent-skill/presets.command";
import { registerAgentSkillUpdateCommand } from "./agent-skill/update.command";
import { registerAgentSkillUploadCommand } from "./agent-skill/upload.command";

/**
 * `nexus agent-skill` — attach Claude Code skill bundles to a code-interpreter
 * agent.
 *
 * Distinct from `nexus claude-code` / `nexus skills`, which install the Nexus
 * OPERATING skills into a LOCAL project so Claude Code can drive this CLI.
 * These commands write to a remote agent: each skill is a ZIP (root-level
 * `SKILL.md` plus supporting files) stored against the agent and unpacked into
 * its sandbox at session start.
 *
 * ── WHICH LEAVES BIND A CONTRACT, AND WHY THE OTHERS MUST NOT ────────────────
 *
 * Each leaf binds its own contract as its last act. Only `create` and `list` do.
 *
 * The v1 contract declares SEVEN descriptors for this namespace — List, Create,
 * Get, Update, Delete, Upload and DownloadUrl, all in
 * `packages/types/src/api/public/v1/contract/agent-skills.ts`. What names the two
 * bound here is the ROLLOUT LEDGER in `contract-help.ledger.ts`: the generator
 * projects only the descriptors that file lists, so the other five are UNROLLED,
 * not uncontracted.
 *
 * 🚨 BINDING ONE OF THOSE FIVE DOES NOT LEAVE IT HONESTLY UNSWEPT — IT THREADS
 * THE WRONG ID, AND THE GATE GOES GREEN ON IT. All five take `:skillId`, and
 * `resolveProducer` in `id-graph.ts` answers it like this:
 *
 *   · The route-prefix rule lands on `/public/v1/agents/:agentId/skills`, which is
 *     `agent-skill list`'s OWN route. A producer must be param-free — the runner
 *     calls every producer with no arguments — so the rule declines.
 *   · The param-name rule then looks for the unique param-free bound GET
 *     collection whose last segment is a plural of `skill`, and finds exactly
 *     one: `tool skills` (`GET /public/v1/tools/skills`). That is the MARKETPLACE
 *     skill catalogue, not the bundles attached to an agent. One candidate is not
 *     ambiguity, so the rule ACCEPTS it.
 *
 * Measured by binding `agent-skill get` and running `deriveIdGraph()`: it comes
 * back `fullyResolved: true` with `skillId` sourced from `tool skills`. So the
 * sweep would call `agent-skill get <agentId> <marketplaceSkillId>`, take a 404,
 * and report FAILED on a healthy route — the false FAILED that
 * `id-graph.leaf-residue.ts` exists to avoid, on `CLI: Sweep`, a required context.
 *
 * ⚠️ THIS IS NOT THE `agent-tool get` / `toolId` CASE, THOUGH IT LOOKS LIKE IT.
 * There the param-name rule finds NO param-free collection ending in `tools`, so
 * it falls through to a declared residue in `id-graph.residue.ts` and the leaf is
 * honestly `fullyResolved: false`. The two diverge only because `skills` happens
 * to name a collection elsewhere in the API. A residue row cannot repair this one:
 * `sourceFor` never consults `residueFor` once a producer resolves. Binding any of
 * the five needs either a `LEAF_RESIDUE` row — which `deriveIdGraph` tests before
 * it resolves sources — or a producer rule that can say "list the agents, then
 * list that agent's skills".
 */
export function registerAgentSkillCommands(program: Command): void {
  const skill = program
    .command("agent-skill")
    .description("Attach Claude Code skills to a code-interpreter agent");

  skill.addHelpText(
    "after",
    `
A SKILL IS A FOLDER WITH A SKILL.md AT ITS ROOT, plus whatever scripts,
templates and references it needs. The platform stores one ZIP per skill against
the agent and unpacks every attached skill into the agent's sandbox at session
start — so a skill added mid-conversation is not loaded until the next session.

THE MODEL DECIDES WHETHER YOU CAN WRITE HERE AT ALL. create, upload, update and
add-preset each return 400 unless the agent runs a model with the code
interpreter; list, get, download and delete stay open, so an agent moved off one
can still be read and cleaned up. Set the model FIRST — "nexus agent update <id>
--model-name <m> --model-provider ANTHROPIC" — not after the upload fails.

THE MODELS THAT CARRY IT ARE THE "code-interpreter-*" ONES, and the name is the
only signal you get: "nexus model list" reports context size and thinking
support but nothing about the code interpreter, so nothing in that table
distinguishes an agent that can hold skills from one that cannot.

THIS IS NOT "nexus claude-code", AND THE TWO POINT IN OPPOSITE DIRECTIONS.
"nexus claude-code" installs the Nexus OPERATING skills into a LOCAL project so
Claude Code can drive this CLI. "nexus agent-skill" uploads a bundle to a REMOTE
agent so that agent can use it in its own sandbox. Nothing you install with one
appears in the other.

FIVE LIMITS, AND THE CLI CHECKS THEM BEFORE UPLOADING SO THE FAILURE NAMES THE
FILE:
  · 500 files per skill        · 2 MB per file
  · 20 MB uncompressed         · 5 MB for the packed .zip
  · 20 skills per agent        · 255 characters per path
The same limits are enforced again server-side, where the refusal is one
sentence about the archive with no path in it — so a --file .zip you packed
yourself fails less usefully than the same tree passed as --dir.

--dir DROPS SOME FILES SILENTLY AND THAT IS DELIBERATE: .git, node_modules,
__pycache__, .DS_Store, __MACOSX and Thumbs.db never travel, and SYMLINKS ARE
SKIPPED RATHER THAN FOLLOWED. A SKILL.md that is a symlink therefore does not
count as one, and the pack fails saying the folder has no SKILL.md.

SCOPES: list, get and download need agent_skills:read; create, upload, update
and add-preset need agent_skills:write; delete needs agent_skills:delete. A key
with only :write cannot clean up after itself.`
  );

  registerAgentSkillListCommand(skill, program);
  registerAgentSkillGetCommand(skill, program);
  registerAgentSkillCreateCommand(skill, program);
  registerAgentSkillUploadCommand(skill, program);
  registerAgentSkillUpdateCommand(skill, program);
  registerAgentSkillDeleteCommand(skill, program);
  registerAgentSkillDownloadCommand(skill, program);
  registerAgentSkillPresetsCommand(skill);
  registerAgentSkillAddPresetCommand(skill, program);
}

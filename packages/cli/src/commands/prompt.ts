import fs from "node:fs";

import { type Command } from "commander";

import { createClient } from "../client";
import { bindCommand } from "../contract-binding";
import { handleError, refuse } from "../errors";
import { color, printEnvelope, printTable } from "../output";
import { confirmable, confirmDestructive } from "../util/confirm";
import {
  PROMPT_COMPARE_CONTRACT,
  PROMPT_GRAPH_CONTRACT,
  PROMPT_VARIANT_ARCHIVE_CONTRACT,
  PROMPT_VARIANT_CREATE_CONTRACT,
  PROMPT_VARIANT_LIST_CONTRACT,
  PROMPT_VARIANT_PROMOTE_CONTRACT,
  PROMPT_VARIANT_RENAME_CONTRACT,
  PROMPT_VARIANT_SAVE_VERSION_CONTRACT,
  PROMPT_VARIANT_VERSION_LIST_CONTRACT
} from "./prompt.contract.generated";

/**
 * `nexus prompt` — branch-based prompt versioning (Prompt Lab phase 1).
 *
 * ## The model in one paragraph
 *
 * Every agent has exactly one **Main** variant — the production lineage, whose
 * name is reserved — plus named variants (branches) forked from any version.
 * `save` appends to a variant's tip; `promote` copies a variant's tip into a
 * NEW Main version. There is no merge, no rebase, and no history rewrite —
 * anywhere. `archive` hides a variant and refuses further writes; nothing is
 * ever deleted, which is why this namespace has no delete verb at all.
 *
 * ## 🔴 `--variant` TAKES A NAME, AN ID, OR "main"
 *
 * Names resolve case-insensitively, so `--variant main` always addresses the
 * Main lineage. In `compare`, `--a`/`--b` may ALSO be a bare version id, so any
 * point in history can be diffed against any other.
 *
 * ## A save NEVER publishes
 *
 * Publishing happens through `promote --publish` and nowhere else — even a
 * save aimed at Main leaves the live prompt untouched. That asymmetry is the
 * whole safety story of variants: iteration is free, going live is deliberate.
 */
export function registerPromptCommands(program: Command): void {
  const prompt = program
    .command("prompt")
    .description("Branch-based prompt versioning: variants, saves, promote, compare, graph");

  const variant = prompt.command("variant").description("Manage prompt variants (branches)");

  const readPromptInput = async (opts: {
    file?: string;
    text?: string;
  }): Promise<string | undefined> => {
    if (opts.file !== undefined && opts.text !== undefined) {
      refuse("Pass --file or --text, not both.");
      return undefined;
    }
    if (opts.text !== undefined) return opts.text;
    if (opts.file !== undefined) {
      if (!fs.existsSync(opts.file) || !fs.statSync(opts.file).isFile()) {
        refuse(`No such file: ${opts.file}`);
        return undefined;
      }
      return fs.readFileSync(opts.file, "utf-8");
    }
    refuse("A prompt is required: pass --file <path> or --text <string>.");
    return undefined;
  };

  // ── variant list ──────────────────────────────────────────────────────────
  const variantList = variant
    .command("list")
    .description("List the agent's variants, Main first")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--all", "Include archived variants")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant list --agent-id 11111111-1111-4111-8111-111111111111
  $ nexus prompt variant list --agent-id 11111111-1111-4111-8111-111111111111 --all --json

Notes:
  A FRESH AGENT ANSWERS EXACTLY ONE VARIANT, "Main" — it is created with the
  agent's lineage and cannot be renamed, archived, or created a second time.
  ARCHIVED VARIANTS ARE HIDDEN unless --all is passed. Archiving deletes
  nothing: the versions and graph edges of an archived variant survive.
  Under --json the payload is a BARE ARRAY of variants (no pagination — the
  set is small by construction).
  To verify what the server actually returned, untouched:
    nexus api GET /agents/<agentId>/prompt-variants --query includeArchived=true`
    )
    .action(async (opts: { agentId: string; all?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.list(opts.agentId, {
          ...(opts.all ? { includeArchived: true } : {})
        });
        printEnvelope(result, () => {
          printTable(
            result.map((v) => ({
              name: v.isMain ? `${v.name} (main)` : v.name,
              status: v.status,
              versions: String(v.versionCount),
              tip: v.tipVersionId ?? "",
              id: v.id
            })),
            [
              { key: "name", label: "VARIANT", width: 24 },
              { key: "status", label: "STATUS", width: 10 },
              { key: "versions", label: "VERSIONS", width: 9 },
              { key: "tip", label: "TIP VERSION", width: 36 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── variant create ────────────────────────────────────────────────────────
  const variantCreate = variant
    .command("create")
    .description("Fork a new variant (default source: the Main tip)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--name <name>", 'New variant name ("Main" is reserved)')
    .option("--from-version <versionId>", "Fork from this version instead of the Main tip")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant create --agent-id 11111111-1111-4111-8111-111111111111 --name "Concise"
  $ nexus prompt variant create --agent-id 11111111-1111-4111-8111-111111111111 \\
      --name "FromV1" --from-version 22222222-2222-4222-8222-222222222222

Notes:
  THE FORK COPIES CONTENT, IT NEVER SHARES IT. The new variant's first version
  is a copy of the source version — compare against the source right after and
  the diff is empty. Later saves on either side never touch the other.
  "MAIN" IS RESERVED in any casing, and a duplicate name (compared
  case-insensitively) is refused with a conflict.
  WITHOUT --from-version the source is the Main tip; a fresh agent that has
  never saved falls back to its current draft prompt.
  An unknown --from-version answers "not found" — including a version that
  belongs to another agent, deliberately indistinguishable from a miss.`
    )
    .action(async (opts: { agentId: string; name: string; fromVersion?: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.create(opts.agentId, {
          name: opts.name,
          ...(opts.fromVersion !== undefined ? { fromVersionId: opts.fromVersion } : {})
        });
        printEnvelope(result, () => {
          console.log(`Created variant ${color.bold(result.name)} (${result.id}).`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── variant rename ────────────────────────────────────────────────────────
  const variantRename = variant
    .command("rename")
    .description("Rename a variant (Main cannot be renamed)")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", 'Variant to rename: name, id — never "main"')
    .requiredOption("--name <name>", "The new name")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant rename --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant "Concise" --name "Concise refunds"

Notes:
  MAIN CANNOT BE RENAMED and nothing can be renamed TO "Main" — the name is
  the anchor every other command's --variant main relies on.
  Renaming changes how the variant is ADDRESSED by name immediately; scripts
  holding the old name will start answering "not found". The id keeps working.
  A name colliding (case-insensitively) with another variant is refused.`
    )
    .action(async (opts: { agentId: string; variant: string; name: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.rename(opts.agentId, opts.variant, {
          name: opts.name
        });
        printEnvelope(result, () => {
          console.log(`Renamed variant to ${color.bold(result.name)}.`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── variant archive ───────────────────────────────────────────────────────
  const variantArchive = confirmable(variant.command("archive"))
    .description("Archive a variant: hidden from lists, refuses writes — nothing is deleted")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", 'Variant to archive: name, id — never "main"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt variant archive --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant "FromV1" --yes

Notes:
  NOTHING IS DELETED. The variant's versions and its fork/promote edges
  survive and stay visible in "nexus prompt graph"; only the default list and
  the write doors close. There is no unarchive in this phase — to keep
  iterating on its content, fork a new variant from one of its versions.
  Saves and promotes on an archived variant answer a conflict naming the
  archived state.
  MAIN CANNOT BE ARCHIVED.`
    )
    .action(async (opts: { agentId: string; variant: string; yes?: boolean }) => {
      try {
        if (
          !(await confirmDestructive(
            `Archive variant "${opts.variant}"? It will stop accepting saves.`,
            opts
          ))
        )
          return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.archive(opts.agentId, opts.variant);
        printEnvelope(result, () => {
          console.log(`Archived variant ${color.bold(result.name)}. Nothing was deleted.`);
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── save ──────────────────────────────────────────────────────────────────
  const save = prompt
    .command("save")
    .description("Append a new version (markdown prompt) to a variant's tip")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", 'Variant to save to: name, id, or "main"')
    .option("--file <path>", "Read the prompt from this file")
    .option("--text <prompt>", "The prompt, inline")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt save --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant "Concise" --text "Be extremely concise. Ask the order number first."
  $ nexus prompt save --agent-id 11111111-1111-4111-8111-111111111111 \\
      --variant main --file ./prompt.md

Notes:
  EXACTLY ONE OF --file / --text IS REQUIRED; passing both, or neither, is
  refused here rather than sent.
  A SAVE NEVER PUBLISHES. Even --variant main only appends to the lineage —
  the live prompt changes through "nexus prompt promote --publish" and through
  nothing in this command.
  An ARCHIVED variant refuses the save with a conflict naming the state.
  The prompt is markdown, the same dialect "nexus agent get --json | .prompt"
  returns — section directives included. Verify what landed with:
    nexus prompt history --agent-id <id> --variant <ref> --json`
    )
    .action(async (opts: { agentId: string; variant: string; file?: string; text?: string }) => {
      try {
        const promptText = await readPromptInput(opts);
        if (promptText === undefined) return;
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.saveVersion(opts.agentId, opts.variant, {
          prompt: promptText
        });
        printEnvelope(result, () => {
          console.log(
            `Saved version ${color.bold(String(result.ordinal))} on variant ${color.bold(result.variantName)} (${result.id}).`
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── history ───────────────────────────────────────────────────────────────
  const history = prompt
    .command("history")
    .description("A variant's versions, oldest first — the last row is the tip")
    .requiredOption("--agent-id <id>", "Agent ID")
    .option("--variant <ref>", 'Variant: name, id, or "main" (the default)', "main")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt history --agent-id 11111111-1111-4111-8111-111111111111
  $ nexus prompt history --agent-id 11111111-1111-4111-8111-111111111111 --variant "Concise" --json

Notes:
  ASCENDING BY ORDINAL: under --json the payload is a bare array and [-1] is
  the tip. Ordinals are contiguous 1..n within a variant and never reused.
  WITHOUT --variant the history shown is Main's.
  A version created by a promote carries promotedFromVersionId — the variant
  tip it copied. isProduction marks the one version the agent serves live.
  History rows carry METADATA ONLY (no prompt body): read a version's content
  by diffing it against an empty ref or via the versions API.`
    )
    .action(async (opts: { agentId: string; variant: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.listVersions(opts.agentId, opts.variant);
        printEnvelope(result, () => {
          if (result.length === 0) {
            console.log("No versions on this variant yet.");
            return;
          }
          printTable(
            result.map((v) => ({
              ordinal: String(v.ordinal),
              type: v.type,
              name: v.name ?? "",
              production: v.isProduction ? "yes" : "",
              promotedFrom: v.promotedFromVersionId ?? "",
              id: v.id
            })),
            [
              { key: "ordinal", label: "#", width: 4 },
              { key: "type", label: "TYPE", width: 11 },
              { key: "name", label: "NAME", width: 16 },
              { key: "production", label: "LIVE", width: 5 },
              { key: "promotedFrom", label: "PROMOTED FROM", width: 36 },
              { key: "id", label: "ID", width: 36 }
            ]
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── promote ───────────────────────────────────────────────────────────────
  const promote = prompt
    .command("promote")
    .description("Copy a variant's tip into a NEW version on Main")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--variant <ref>", "Variant whose tip goes to Main: name or id")
    .option("--publish", "Also make the new Main version the live prompt")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt promote --agent-id 11111111-1111-4111-8111-111111111111 --variant "Concise"
  $ nexus prompt promote --agent-id 11111111-1111-4111-8111-111111111111 --variant "Concise" --publish

Notes:
  PROMOTE APPENDS, NEVER MOVES. Main gains one new version whose content
  copies the variant's tip and whose promotedFromVersionId records the edge;
  the variant itself is untouched and its history is never rewritten. Running
  promote twice appends twice.
  WITHOUT --publish the live prompt does not change — the new Main version is
  lineage only. With it, the agent's production pointer AND its draft move to
  the promoted content (the existing publish semantics).
  Refused on Main itself, on archived variants, and on a variant with no
  versions. Verify with:
    nexus prompt history --agent-id <id> --variant main --json`
    )
    .action(async (opts: { agentId: string; variant: string; publish?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.promote(opts.agentId, opts.variant, {
          ...(opts.publish ? { publish: true } : {})
        });
        printEnvelope(result, () => {
          console.log(
            `Promoted to Main as version ${color.bold(String(result.ordinal))} (${result.newMainVersionId})${
              result.published ? " and published" : ""
            }.`
          );
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── compare ───────────────────────────────────────────────────────────────
  const compare = prompt
    .command("compare")
    .description("Server-side line diff between two refs")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--a <ref>", 'First ref: version id, variant name (its tip), or "main"')
    .requiredOption("--b <ref>", 'Second ref: version id, variant name (its tip), or "main"')
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt compare --agent-id 11111111-1111-4111-8111-111111111111 --a main --b "Concise"
  $ nexus prompt compare --agent-id 11111111-1111-4111-8111-111111111111 \\
      --a 22222222-2222-4222-8222-222222222222 --b main --json

Notes:
  A VARIANT NAME MEANS ITS TIP; "main" means the Main tip; a bare version id
  means that exact version — so any point in history diffs against any other.
  Names win over ids when a ref could be both.
  AN EMPTY "changes" ARRAY MEANS IDENTICAL TEXT — right after a fork it is
  the proof the copy was exact, not a failure to diff.
  The diff is over the serialized markdown, line by line: "remove" lines count
  positions in --a, "add" lines count positions in --b.`
    )
    .action(async (opts: { agentId: string; a: string; b: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.compare(opts.agentId, {
          a: opts.a,
          b: opts.b
        });
        printEnvelope(result, () => {
          console.log(
            `${color.bold(result.a.variantName)}#${result.a.ordinal} vs ${color.bold(result.b.variantName)}#${result.b.ordinal}`
          );
          if (result.changes.length === 0) {
            console.log("No differences — the two refs hold identical prompt text.");
            return;
          }
          for (const change of result.changes) {
            const sign = change.op === "add" ? "+" : "-";
            console.log(`${sign} [${change.line}] ${change.text}`);
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── graph ─────────────────────────────────────────────────────────────────
  const graph = prompt
    .command("graph")
    .description("The version graph: every version, fork and promote edges")
    .requiredOption("--agent-id <id>", "Agent ID")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus prompt graph --agent-id 11111111-1111-4111-8111-111111111111
  $ nexus prompt graph --agent-id 11111111-1111-4111-8111-111111111111 --json

Notes:
  Under --json the payload is {nodes, edges}: nodes are versions with their
  variant lane and ordinal, edges carry kind "fork" (source version -> the new
  variant's first version) or "promote" (variant tip -> the new Main version).
  ARCHIVED VARIANTS STAY IN THE GRAPH — hiding a lane would orphan the promote
  edges that left it. Use "nexus prompt variant list" for the active set.
  The human view is variants as indented lists, edges last; it is a summary,
  not a drawing — the frontend graph (later phase) renders this same payload.`
    )
    .action(async (opts: { agentId: string }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.promptVariants.graph(opts.agentId);
        printEnvelope(result, () => {
          const byVariant = new Map<string, typeof result.nodes>();
          for (const node of result.nodes) {
            const lane = byVariant.get(node.variantName) ?? [];
            lane.push(node);
            byVariant.set(node.variantName, lane);
          }
          for (const [variantName, lane] of byVariant) {
            const isMain = lane[0]?.isMain ?? false;
            console.log(color.bold(isMain ? `${variantName} (main)` : variantName));
            for (const node of lane) {
              const marks = [
                node.isProduction ? "live" : "",
                node.promotedFromVersionId ? `promoted from ${node.promotedFromVersionId}` : ""
              ]
                .filter(Boolean)
                .join(", ");
              console.log(`  #${node.ordinal} ${node.id}${marks ? `  (${marks})` : ""}`);
            }
          }
          for (const edge of result.edges) {
            console.log(color.dim(`${edge.kind}: ${edge.from} -> ${edge.to}`));
          }
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option and the hand-written prose, so the
  // generated reference lands below the Notes — the ordering the score
  // namespace established.
  bindCommand(variantList, PROMPT_VARIANT_LIST_CONTRACT, {
    // The wire field is the string enum "true"/"false" a query string can
    // carry; the CLI's spelling of it is the boolean --all flag above. Binding
    // the raw enum would put --include-archived <true|false> beside --all —
    // two flags for one bit.
    "Params.includeArchived": "exposed as the --all boolean; the enum is the query-string encoding"
  });
  bindCommand(variantCreate, PROMPT_VARIANT_CREATE_CONTRACT);
  bindCommand(variantRename, PROMPT_VARIANT_RENAME_CONTRACT);
  bindCommand(variantArchive, PROMPT_VARIANT_ARCHIVE_CONTRACT);
  bindCommand(save, PROMPT_VARIANT_SAVE_VERSION_CONTRACT);
  bindCommand(history, PROMPT_VARIANT_VERSION_LIST_CONTRACT);
  bindCommand(promote, PROMPT_VARIANT_PROMOTE_CONTRACT);
  bindCommand(compare, PROMPT_COMPARE_CONTRACT);
  bindCommand(graph, PROMPT_GRAPH_CONTRACT);
}

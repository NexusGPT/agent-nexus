/**
 * Render a {@link DocNamespace} into the MDX of a generated docs page.
 *
 * Pure: a model in, a string out. No filesystem, no commander, no contract
 * import beyond types — so the gate can render and compare without a build.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE RULE THIS RENDERER INHERITS: WHERE TWO SOURCES DISAGREE, GO RED AND
 * NAME BOTH. NEVER PICK A WINNER.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The contract and the CLI are two opinions and each has been the wrong one.
 * `DeploymentTypeSchema` lists `SMS`; the server 500s on `SMS`; the CLI omits it
 * deliberately. The hand-written `deployment.mdx` followed the contract and told
 * readers `SMS` was one of 22 accepted types, with no caveat — the doc was wrong
 * and the `--help` was right. The inverse is just as live: five measured cases
 * where the CLI's own help states something false that the contract gets right.
 *
 * So `renderDivergence` — in `docs-page.render.divergence.ts` — prints the
 * contract's list AND the CLI's list AND the reason, under a warning callout,
 * every time. There is deliberately no code path that emits one side alone:
 *
 *   · printing only the contract republishes a value the server rejects;
 *   · printing only the CLI hides that every SDK and MCP consumer is still being
 *     told the broken value works, which is the thing that actually needs fixing.
 *
 * A generated page that silently resolved this would turn a visible
 * disagreement into a single confident sentence, and a green consistency gate
 * over it would read as a claim that the sentence is TRUE. Consistency is not
 * truth. The page's job here is to refuse to be the place the disagreement goes
 * quiet.
 *
 * 🔴 `GENERATED_MARKER` IS DECLARED HERE AND MUST STAY DECLARED HERE, not
 * re-exported from a sibling. `generated-artifacts.spec.ts` in the backend
 * reads THIS path and regexes the declaration out of it rather than
 * transcribing the value — its own words: "a transcribed marker goes vacuous
 * silently", because a rule that stops matching any page turns every
 * projection into an authored file with no stated reason.
 * `scripts/verify-docs-api-urls.ts` names this file as the marker's emitter for
 * the same reason. A re-export satisfies the typechecker and leaves both of
 * them reading a file with no declaration in it.
 */

import { AUTHORED_FRONTMATTER } from "./docs-page.frontmatter";
import type { DocNamespace } from "./docs-page.model";
import { renderDivergence } from "./docs-page.render.divergence";

/** Frontmatter and body are separated so the gate can diff them independently. */
export const GENERATED_MARKER = "generated: true";

const BANNER =
  "This page is projected from the CLI command tree and the Public API v1 contract. " +
  "Edit the `.option`, `.addHelpText` and `bindCommand` calls in the sources listed above — " +
  "an edit here is overwritten, and the build refuses it.";

function fence(body: string, language = "text"): string[] {
  return ["```" + language, body, "```", ""];
}

function frontmatter(namespace: DocNamespace): string[] {
  const authored = AUTHORED_FRONTMATTER[namespace.name];
  if (authored === undefined) {
    throw new Error(
      `No authored frontmatter for "${namespace.name}". Add a title, an icon and a ` +
        `description to docs-page.frontmatter.ts — they cannot be derived from the tree.`
    );
  }

  return [
    "---",
    `title: "${authored.title}"`,
    `description: "${authored.description}"`,
    `icon: "${authored.icon}"`,
    'section: "cli"',
    GENERATED_MARKER,
    "sourceRefs:",
    ...namespace.sourceRefs.map((ref) => `  - ${ref}`),
    "---",
    ""
  ];
}

export function renderNamespacePage(namespace: DocNamespace): string {
  const lines: string[] = [
    ...frontmatter(namespace),
    '<Callout type="info" title="Generated page">',
    BANNER,
    "</Callout>",
    ""
  ];

  if (namespace.help.length > 0) lines.push(...fence(namespace.help));

  if (namespace.aliases.length > 0) {
    lines.push(
      `Also reachable as ${namespace.aliases.map((a) => `\`nexus ${a}\``).join(", ")}.`,
      ""
    );
  }

  if (namespace.hiddenSiblings.length > 0) {
    lines.push(
      "## Aliases",
      "",
      "These are registered hidden, so they appear in NO `--help` output and no " +
        "rendered-help scrape can find them. Each runs the same action as " +
        `\`nexus ${namespace.name}\`:`,
      "",
      namespace.hiddenSiblings.map((alias) => `\`nexus ${alias}\``).join(" · "),
      ""
    );
  }

  for (const command of namespace.commands) {
    if (command.hidden) continue;

    // `path` is already fully qualified — `walk()` prefixes it with the
    // namespace. Re-adding the name here produced `## nexus analytics analytics
    // feedback`, which reads as a real command and is not one.
    lines.push(`## nexus ${command.path}`, "");
    if (command.description.trim().length > 0) lines.push(command.description.trim(), "");
    if (command.aliases.length > 0) {
      lines.push(`Aliases: ${command.aliases.map((a) => `\`${a}\``).join(", ")}`, "");
    }
    lines.push(...fence(command.help));
    for (const divergence of command.divergences) lines.push(...renderDivergence(divergence));
  }

  lines.push(
    "---",
    "",
    "See [Global Options & Environment](/docs/cli/global-options) for the flags every " +
      "command group accepts, and [Input & Output](/docs/cli/output-and-input) for " +
      "`--json`, stdin and file bodies.",
    ""
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

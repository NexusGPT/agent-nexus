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
 * So {@link renderDivergence} prints the contract's list AND the CLI's list AND
 * the reason, under a warning callout, every time. There is deliberately no code
 * path that emits one side alone:
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
 */

import { AUTHORED_FRONTMATTER } from "./docs-page.frontmatter";
import type { DocDivergence, DocNamespace } from "./docs-page.model";

/** Frontmatter and body are separated so the gate can diff them independently. */
export const GENERATED_MARKER = "generated: true";

const BANNER =
  "This page is projected from the CLI command tree and the Public API v1 contract. " +
  "Edit the `.option`, `.addHelpText` and `bindCommand` calls in the sources listed above — " +
  "an edit here is overwritten, and the build refuses it.";

function fence(body: string, language = "text"): string[] {
  return ["```" + language, body, "```", ""];
}

/**
 * Both lists, the delta in each direction, and the reason. Never one side.
 * See this module's header for why there is no "resolved" branch.
 *
 * 🔴 IT RENDERS VALUES, NEVER A PROMISE ABOUT VALIDATION. `.argParser()`
 * SILENTLY DISABLES `.choices()` in commander 13, and nothing observable says
 * so: `--help` prints `(choices: …)` either way and `option.argChoices` reports
 * the list either way. So "this flag only accepts these values" is a claim
 * neither the tree nor the contract can support, and a page asserting it would
 * be confidently wrong on exactly the options that take a parser. The wording
 * below states what the two sources LIST, and never that anything is refused.
 */
function renderDivergence(divergence: DocDivergence): string[] {
  // 🚨 A DECLARED DIVERGENCE IS NOT ALWAYS A DIFFERENCE, AND SAYING SO ANYWAY IS
  // A FALSE CLAIM ON A GENERATED PAGE — the exact regression this whole gate is
  // meant to make impossible. `deployment create --type` declares one whose
  // `omit` and `alsoAccepts` are both empty: its reason is "values are
  // case-insensitive", a NORMALISATION note, not a disagreement. Rendered
  // through the warning branch it produced a callout headed "the contract and
  // the CLI disagree" above two byte-identical 22-value lists.
  //
  // So the branch is chosen from the DELTA, never from the presence of a
  // declaration. No delta, no disagreement — the reason still gets printed,
  // because it is true and useful; it just is not a warning.
  const hasDelta = divergence.omitted.length > 0 || divergence.alsoAccepts.length > 0;

  if (!hasDelta) {
    return [
      `<Callout type="info" title="\`${divergence.flags}\`">`,
      "",
      divergence.because,
      "",
      `Accepted values: ${divergence.offered.map((v) => `\`${v}\``).join(", ")}`,
      "</Callout>",
      ""
    ];
  }

  const lines: string[] = [
    `<Callout type="warning" title="The contract and the CLI disagree about \`${divergence.flags}\`">`,
    "",
    divergence.because,
    "",
    `- **The v1 contract lists:** ${divergence.contractValues.map((v) => `\`${v}\``).join(", ")}`,
    `- **This CLI offers:** ${divergence.offered.map((v) => `\`${v}\``).join(", ")}`
  ];

  if (divergence.omitted.length > 0) {
    lines.push(
      `- **Not offered by the CLI:** ${divergence.omitted.map((v) => `\`${v}\``).join(", ")} — ` +
        "the contract still lists these, so the SDK and the MCP server continue to offer them."
    );
  }
  if (divergence.alsoAccepts.length > 0) {
    lines.push(
      `- **Offered by the CLI only:** ${divergence.alsoAccepts.map((v) => `\`${v}\``).join(", ")} — ` +
        "normalised into a contract value before the request is sent."
    );
  }

  lines.push(
    "",
    "This page states both and resolves neither. Reconciling them is a change to the " +
      "contract or to the flag, not to this page.",
    "</Callout>",
    ""
  );
  return lines;
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

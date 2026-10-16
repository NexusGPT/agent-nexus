import type { DocDivergence } from "./docs-page.model";

/**
 * THE CALLOUT A DECLARED DIVERGENCE RENDERS INTO.
 *
 * `docs-page.render.ts`'s header owns the rule this obeys: where two sources
 * disagree, go RED and name both, never pick a winner.
 */

/**
 * Both lists, the delta in each direction, and the reason. Never one side.
 * See `docs-page.render.ts`'s header for why there is no "resolved" branch.
 *
 * 🔴 IT RENDERS VALUES, NEVER A PROMISE ABOUT VALIDATION. `.argParser()`
 * SILENTLY DISABLES `.choices()` in commander 13, and nothing observable says
 * so: `--help` prints `(choices: …)` either way and `option.argChoices` reports
 * the list either way. So "this flag only accepts these values" is a claim
 * neither the tree nor the contract can support, and a page asserting it would
 * be confidently wrong on exactly the options that take a parser. The wording
 * below states what the two sources LIST, and never that anything is refused.
 */
export function renderDivergence(divergence: DocDivergence): string[] {
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

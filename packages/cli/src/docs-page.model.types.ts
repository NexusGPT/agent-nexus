import type { CommandOption } from "./command-universe";

/**
 * THE SHAPES A GENERATED DOCS PAGE IS RENDERED FROM. Plain data, no walk —
 * `docs-page.model.ts` builds them and its header owns the reasoning.
 */

/**
 * A declared disagreement between the contract and what the CLI offers.
 *
 * 🚨 BOTH SIDES ARE CARRIED, ALWAYS. This type has no field for "the answer".
 * Where the two sources disagree the page goes RED and names both; it never
 * resolves the disagreement, because resolving it is how the wrong one becomes
 * authoritative. `DeploymentTypeSchema` lists `SMS`, the server 500s on `SMS`,
 * and the CLI omits it on purpose — a page printing only the contract's list
 * republishes a broken value, and a page printing only the CLI's list hides that
 * every SDK and MCP consumer is still being told it works.
 */
export interface DocDivergence {
  readonly flags: string;
  readonly contractValues: readonly string[];
  readonly offered: readonly string[];
  readonly omitted: readonly string[];
  readonly alsoAccepts: readonly string[];
  readonly because: string;
}

export interface DocCommand {
  readonly path: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly hidden: boolean;
  readonly help: string;
  readonly options: readonly CommandOption[];
  readonly divergences: readonly DocDivergence[];
}

export interface DocNamespace {
  readonly name: string;
  readonly description: string;
  readonly help: string;
  readonly aliases: readonly string[];
  readonly hiddenSiblings: readonly string[];
  readonly commands: readonly DocCommand[];
  readonly sourceRefs: readonly string[];
}

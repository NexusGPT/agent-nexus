import { color } from "../../../output";

/** One node of the version graph, as `promptVariants.graph` returns it. */
interface GraphNode {
  readonly variantId: string;
  readonly variantName: string;
  readonly isMain: boolean;
  readonly ordinal: number;
  readonly id: string;
  readonly isProduction: boolean;
  readonly promotedFromVersionId?: string | null;
}

/** One edge of the version graph. */
interface GraphEdge {
  readonly kind: string;
  readonly from: string;
  readonly to: string;
}

/** Group the nodes into one lane per variant ID, in first-seen order. */
function lanesByVariant(nodes: readonly GraphNode[]): Map<string, GraphNode[]> {
  const byVariant = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const lane = byVariant.get(node.variantId) ?? [];
    lane.push(node);
    byVariant.set(node.variantId, lane);
  }
  return byVariant;
}

/** How many lanes answer to each lower-cased variant NAME. */
function laneCountPerName(byVariant: Map<string, GraphNode[]>): Map<string, number> {
  const lanesPerName = new Map<string, number>();
  for (const [first] of byVariant.values()) {
    if (!first) continue;
    const key = first.variantName.toLowerCase();
    lanesPerName.set(key, (lanesPerName.get(key) ?? 0) + 1);
  }
  return lanesPerName;
}

/**
 * The human view of the version graph: variants as indented lists, edges last.
 *
 * Lanes by variant ID. Archiving frees a name (NEX-5806), so an archived
 * variant and the active one that took its name are two lanes sharing one
 * name — grouped by name, their versions merged into one list.
 */
export function printVariantGraph(result: {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}): void {
  const byVariant = lanesByVariant(result.nodes);
  const lanesPerName = laneCountPerName(byVariant);

  for (const [variantId, lane] of byVariant) {
    const variantName = lane[0]?.variantName ?? "";
    const isMain = lane[0]?.isMain ?? false;
    const shared = (lanesPerName.get(variantName.toLowerCase()) ?? 0) > 1;
    let label = variantName;
    if (isMain) label = `${variantName} (main)`;
    else if (shared) label = `${variantName} (${variantId})`;
    console.log(color.bold(label));
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
}

/**
 * Parse the test-scope flags (`--sample` / `--sample-node` / `--limit-array`)
 * into the `sampleConfig` map the test API expects (NEX-2053).
 *
 * `sampleConfig` maps a node id to the maximum number of array items that node
 * may iterate/emit during the test run. The engine applies the cap in-place, so
 * a large upstream collection can be scoped down for a test without editing the
 * workflow definition.
 *
 * Pure (throws on invalid input) so it can be unit-tested without commander.
 */
export interface SampleFlagInput {
  /** `--sample N`: max items for the node named by `--sample-node`. */
  sample?: string;
  /** `--sample-node <id>`: the loop (or array) node to cap. */
  sampleNode?: string;
  /** `--limit-array <nodeId>=<N>` entries (repeatable). */
  limitArray?: string[];
}

function parsePositiveInt(raw: string, ctx: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${ctx}: "${raw}" — expected a positive integer.`);
  }
  return n;
}

export function parseSampleConfig(input: SampleFlagInput): Record<string, number> | undefined {
  const config: Record<string, number> = {};

  // --sample / --sample-node must be used together.
  if (input.sample != null || input.sampleNode) {
    if (input.sample == null || !input.sampleNode) {
      throw new Error("--sample requires --sample-node (and vice versa).");
    }
    config[input.sampleNode] = parsePositiveInt(input.sample, "--sample value");
  }

  // --limit-array nodeId=N (repeatable). Later entries win on conflict.
  for (const pair of input.limitArray ?? []) {
    const eq = pair.indexOf("=");
    if (eq <= 0 || eq === pair.length - 1) {
      throw new Error(`Invalid --limit-array "${pair}" — expected <nodeId>=<N>.`);
    }
    const nodeId = pair.slice(0, eq).trim();
    const n = parsePositiveInt(pair.slice(eq + 1).trim(), `--limit-array value for "${nodeId}"`);
    config[nodeId] = n;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

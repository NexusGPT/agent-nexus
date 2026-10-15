/** Commander collector for repeatable --query options. */
export function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Parse ["key=value", ...] into { key: "value", ... }. */
export function parseQueryPairs(pairs: string[]): Record<string, string> | undefined {
  if (pairs.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) {
      result[pair] = "true";
    } else {
      result[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return result;
}

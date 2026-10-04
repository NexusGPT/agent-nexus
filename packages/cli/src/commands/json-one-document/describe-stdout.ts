/**
 * How many top-level JSON values does this text hold, and is there prose?
 *
 * `JSON.parse` alone answers "not one" and never "how many", and the difference
 * decides whether a reader looks for a second printer or for a stray
 * `console.log("Deleted.")`. So this scans values itself: a balanced walk that
 * respects strings and escapes, which is enough to separate the two causes
 * without pulling in a parser.
 */
export function describeStdout(raw: string): { documents: number; prose: boolean } {
  const text = raw.trim();
  if (text === "") return { documents: 0, prose: false };

  let index = 0;
  let documents = 0;

  const skipSpace = (): void => {
    while (index < text.length && /\s/.test(text[index])) index += 1;
  };

  while (true) {
    skipSpace();
    if (index >= text.length) break;

    const start = index;
    const open = text[index];
    if (open !== "{" && open !== "[") return { documents, prose: true };

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (; index < text.length; index += 1) {
      const ch = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{" || ch === "[") depth += 1;
      else if (ch === "}" || ch === "]") {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
    }
    if (depth !== 0) return { documents, prose: true };

    try {
      JSON.parse(text.slice(start, index));
    } catch {
      return { documents, prose: true };
    }
    documents += 1;
  }

  return { documents, prose: false };
}

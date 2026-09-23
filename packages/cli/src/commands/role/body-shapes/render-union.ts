import { CONTINUATION } from "./key-column";

/**
 * Render a closed union's members as a quoted alternation.
 *
 * Read off a `Record<Union, true>` for the reason the whole file exists: a value
 * added to the union is a compile error at the record rather than a `--help`
 * that omits it.
 */
export function renderUnion(members: Record<string, true>, width = Infinity): string {
  const quoted = Object.keys(members).map((member) => JSON.stringify(member));
  const lines: string[] = [];
  let line = "";
  for (const member of quoted) {
    const candidate = line === "" ? member : `${line}|${member}`;
    if (candidate.length > width && line !== "") {
      lines.push(`${line}|`);
      line = member;
    } else {
      line = candidate;
    }
  }
  lines.push(line);
  return lines.join(`\n${CONTINUATION}`);
}

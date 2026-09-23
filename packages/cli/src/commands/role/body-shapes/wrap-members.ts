/** Wrap a member list at `width`, indenting every continuation line. */
export function wrapMembers(members: readonly string[], indent: string, width: number): string {
  const lines: string[] = [];
  let line = "";
  for (const member of members) {
    const candidate = line === "" ? member : `${line}, ${member}`;
    if (candidate.length > width && line !== "") {
      // The trailing comma is what says the list CONTINUES. Without it a wrapped
      // enumeration reads as several complete lists, which is the one thing this
      // block exists to prevent — a caller who stops at line one has an
      // incomplete vocabulary and no way to know it.
      lines.push(`${line},`);
      line = member;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines.map((entry) => `${indent}${entry}`).join("\n");
}

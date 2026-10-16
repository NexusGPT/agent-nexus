/**
 * READING `CHANGELOG.md` AS EVIDENCE THAT A DEPRECATION WAS ANNOUNCED.
 *
 * The gate spends a cycle only when the changelog SECTION for the announcing
 * release names the path, so both halves of that sentence live here: splitting
 * the document into sections, and deciding whether one of them announces a
 * given command.
 */

/**
 * DOES THIS CHANGELOG ENTRY ANNOUNCE **THIS** COMMAND?
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * `entry.includes(path)` IS WRONG, AND IT IS WRONG IN THE PERMISSIVE DIRECTION
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 🚨 A COMMAND PATH IS A PREFIX AND A SUFFIX OF OTHER COMMAND PATHS. A bare
 * substring test spends a cycle on an entry that announced a DIFFERENT leaf:
 *
 *   `agent list-templates`   contains `agent list`
 *   `workflow agent list`    contains `agent list`
 *   `agent list templates`   contains `agent list`
 *
 * Each of those is a real announcement of a real command, and none of them says
 * anything about `agent list` — so each would discharge a deprecation nobody
 * announced. That is the whole gate walked around by a coincidence of spelling.
 *
 * ── THE ANCHOR, AND WHY IT IS THE CODE SPAN ─────────────────────────────────
 *
 * `CHANGELOG.md` names a command inside a code span, with or without the binary
 * name: `` `agent delete` ``, `` `nexus customer delete <id> | tee log` ``. So a
 * match must START the span — optionally after `nexus ` — which is what rules
 * out `workflow agent list`. And it must END the span or be followed by a FLAG
 * or an ARGUMENT PLACEHOLDER, which is what rules out both `list-templates`
 * (no space before the hyphen) and a further subcommand.
 *
 * ⚠️ A mention in plain prose, with no code span, does NOT count. That is
 * stricter than a human reader would be, and it is deliberate: every command
 * named in this package's changelog is already backticked, and the refusal
 * message says exactly what to write. A gate whose input is our own file, edited
 * by the same person adding the record, can afford to ask for one convention.
 */
export function changelogAnnounces(entry: string, path: string): boolean {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // ── `  or  `nexus     then the path, then the end of the span or a flag/arg.
  return new RegExp("`(?:nexus )?" + escaped + "(?=`| +[-<\\[])").test(entry);
}

/**
 * `CHANGELOG.md` split into one entry per released version.
 *
 * The body runs from a `## x.y.z` heading to the next one, so the section for a
 * version is exactly what that release told its readers. A heading with no
 * section under it maps to the empty string rather than being absent — an empty
 * entry and a missing version are different facts and the caller says different
 * things about them.
 */
export function changelogSections(changelog: string): ReadonlyMap<string, string> {
  const sections = new Map<string, string>();
  const headings = [...changelog.matchAll(/^## +(\d+\.\d+\.\d+)[^\n]*$/gm)];

  headings.forEach((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length;
    const end =
      index + 1 < headings.length
        ? (headings[index + 1].index ?? changelog.length)
        : changelog.length;
    sections.set(heading[1], changelog.slice(start, end));
  });

  return sections;
}

/**
 * One GitHub compare between the bundle's pin and an upstream commit, read into
 * the shape the release gate reasons over: the commits the pin is missing, the
 * first-parent line they landed on, and every path the range changes.
 *
 * Nothing here decides a verdict. `publish-pin.ts` does, so a change to how a
 * payload is read cannot quietly alter what a verdict MEANS.
 */

/**
 * GitHub's compare endpoint returns at most 250 commits and 300 files inline. Past
 * either, the list this gate reasons over is quietly incomplete, so it says so
 * rather than reading a partial list as the whole.
 */
export const COMPARE_INLINE_LIMIT = 250;
export const COMPARE_FILES_LIMIT = 300;

export interface MissingCommit {
  sha: string;
  date: string;
  subject: string;
  /** Pull-request number when the message is a merge commit; `null` otherwise. */
  pr: number | null;
}

/** `Merge pull request #45 from …` — upstream's merge-commit spelling. */
const MERGE_PR_PATTERN = /^Merge pull request #(\d+) /;

export interface CompareCommit {
  missing: MissingCommit;
  firstParent: string | null;
}

function toCompareCommit(entry: unknown): CompareCommit | null {
  if (typeof entry !== "object" || entry === null) return null;
  const sha = (entry as { sha?: unknown }).sha;
  if (typeof sha !== "string" || sha === "") return null;

  const commit = (entry as { commit?: unknown }).commit;
  const committer =
    typeof commit === "object" && commit !== null
      ? (commit as { committer?: unknown }).committer
      : undefined;
  const rawDate =
    typeof committer === "object" && committer !== null
      ? (committer as { date?: unknown }).date
      : undefined;
  const rawMessage =
    typeof commit === "object" && commit !== null
      ? (commit as { message?: unknown }).message
      : undefined;

  const parents = (entry as { parents?: unknown }).parents;
  const first = Array.isArray(parents) ? (parents[0] as { sha?: unknown } | undefined) : undefined;

  const message = typeof rawMessage === "string" ? rawMessage : "";
  const subject = message.split("\n")[0] ?? "";
  const prMatch = MERGE_PR_PATTERN.exec(subject);

  return {
    missing: {
      sha,
      // An entry missing its date is reported as unknown rather than dropped: the
      // commit is still missing from the pin, and losing it to keep the row tidy
      // would shrink the very list this check exists to print.
      date: typeof rawDate === "string" && rawDate !== "" ? rawDate : "(date unavailable)",
      subject: subject === "" ? "(no subject)" : subject,
      pr: prMatch === null ? null : Number(prMatch[1])
    },
    firstParent: typeof first?.sha === "string" ? first.sha : null
  };
}

export function renderMissing(missing: MissingCommit[], totalCommits: number): string[] {
  const lines = missing.map((c) => {
    const pr = c.pr === null ? "" : ` (#${c.pr})`;
    return `  ${c.sha.slice(0, 10)}  ${c.date}  ${c.subject}${pr}`;
  });
  if (totalCommits > missing.length) {
    lines.push(
      `  … and ${totalCommits - missing.length} more not listed: the compare endpoint ` +
        `returns at most ${COMPARE_INLINE_LIMIT} commits inline.`
    );
  }
  return lines;
}

export interface ComparedRange {
  status: string;
  behindBy: number;
  totalCommits: number;
  commits: CompareCommit[];
  /** Every changed path, both sides of a rename; null when GitHub truncated the list. */
  paths: string[] | null;
}

export function parseCompare(body: unknown): ComparedRange {
  const b = body as {
    status?: unknown;
    behind_by?: unknown;
    total_commits?: unknown;
    commits?: unknown;
    files?: unknown;
  };
  const rawCommits = Array.isArray(b.commits) ? b.commits : [];
  const rawFiles = Array.isArray(b.files) ? b.files : null;
  const paths =
    rawFiles === null || rawFiles.length >= COMPARE_FILES_LIMIT
      ? null
      : rawFiles.flatMap((f: unknown) => {
          if (typeof f !== "object" || f === null) return [];
          const { filename, previous_filename } = f as {
            filename?: unknown;
            previous_filename?: unknown;
          };
          return [filename, previous_filename].filter(
            (p): p is string => typeof p === "string" && p !== ""
          );
        });
  return {
    status: typeof b.status === "string" ? b.status : "",
    behindBy: typeof b.behind_by === "number" ? b.behind_by : 0,
    totalCommits: typeof b.total_commits === "number" ? b.total_commits : 0,
    commits: rawCommits.map(toCompareCommit).filter((c): c is CompareCommit => c !== null),
    paths
  };
}

/**
 * The newest commit on upstream's FIRST-PARENT line that had landed by `deadline`,
 * walking down from head through the commits the pin is missing.
 *
 * First-parent, because that line is the order things LANDED on `main`: a commit
 * written on a branch on Monday and merged on Friday landed on Friday, and only
 * the merge commit — on the first-parent line — carries Friday's date.
 *
 * `null` when every first-parent commit the pin is missing landed after the
 * deadline. `"broken"` when the walk could not be completed from what GitHub
 * returned, which is not the same answer and must not read as one.
 */
export function landedBy(
  range: ComparedRange,
  head: string,
  deadline: number
): { sha: string } | null | "broken" {
  const bySha = new Map(range.commits.map((c) => [c.missing.sha, c]));
  let at: string | null = head;
  while (at !== null && bySha.has(at)) {
    const entry = bySha.get(at) as CompareCommit;
    const landed = Date.parse(entry.missing.date);
    if (Number.isNaN(landed)) return "broken";
    if (landed <= deadline) return { sha: at };
    at = entry.firstParent;
  }
  return null;
}

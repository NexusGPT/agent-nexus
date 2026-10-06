/**
 * What a re-cut of the bundled skills CHANGES, rendered for the release PR body —
 * so the human merging a CLI release reads every permission and hook change the
 * bundle is about to ship before it ships.
 *
 * `release-version.yml` re-cuts the bundle at upstream head inside the release
 * commit. That makes the bundle current by construction, and it also means the
 * release PR is the one place a person sees upstream's changes before they freeze
 * into an npm tarball. A generated JSON diff is unreadable at that size, so this
 * reads the two payloads and says, in order of consequence:
 *
 *   1. `settings.json` — every `allow`/`ask`/`deny` entry added or removed, and
 *      `defaultMode`, by name; every other top-level key that changed; and the
 *      full file diff. This is what decides what an agent may run unprompted.
 *   2. hooks, agents and `CLAUDE.md` — every file added, removed or modified,
 *      with its line counts. Hooks are enforcement code that runs on every tool
 *      call.
 *   3. skills — per skill, how many files moved. Prose, mostly; counted, not quoted.
 *
 * It renders from the PAYLOADS — the bytes the tarball carries — never from the
 * upstream repository, so what it shows is what ships.
 */

import { lineCounts, renderDiff } from "./line-diff";
import { RELEASE_STALENESS_TOLERANCE_HOURS } from "./release-deadline";

/** The fields of `skills-content.generated.json` this reads. */
export interface BundlePayload {
  sha: string;
  SKILLS: Record<string, { files: { path: string; content: string }[] }>;
  CLAUDE_MD: string;
  SHARED_FILES: { path: string; content: string }[];
  SETTINGS_JSON: string;
  HOOK_FILES: { path: string; content: string }[];
  AGENT_FILES: { path: string; content: string }[];
}

const UPSTREAM = "https://github.com/NexusGPT/claude-code-skills-nexus";

/** A PR body is capped at 65,536 characters; this leaves room for the rest of it. */
const MAX_CHARS = 40_000;

type Permissions = { allow: string[]; ask: string[]; deny: string[]; defaultMode: string | null };

function parseSettings(
  raw: string
): { permissions: Permissions; rest: Record<string, unknown> } | null {
  if (raw.trim() === "") {
    return { permissions: { allow: [], ask: [], deny: [], defaultMode: null }, rest: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const { permissions, ...rest } = parsed as { permissions?: unknown } & Record<string, unknown>;
  const p = (typeof permissions === "object" && permissions !== null ? permissions : {}) as Record<
    string,
    unknown
  >;
  const list = (key: string): string[] =>
    Array.isArray(p[key])
      ? (p[key] as unknown[]).filter((e): e is string => typeof e === "string")
      : [];
  return {
    permissions: {
      allow: list("allow"),
      ask: list("ask"),
      deny: list("deny"),
      defaultMode: typeof p.defaultMode === "string" ? p.defaultMode : null
    },
    rest
  };
}

function renderSettings(before: string, after: string): string[] {
  if (before === after) return ["`settings.json` is unchanged."];
  const b = parseSettings(before);
  const a = parseSettings(after);
  const lines: string[] = [];
  if (b === null || a === null) {
    lines.push(
      `> **\`settings.json\` does not parse ${b === null ? "before" : "after"} this re-cut** — ` +
        "read the full diff below; no summary is possible."
    );
  } else {
    const rows: string[] = [];
    for (const key of ["allow", "ask", "deny"] as const) {
      const was = new Set(b.permissions[key]);
      const now = new Set(a.permissions[key]);
      for (const entry of a.permissions[key]) {
        if (!was.has(entry)) rows.push(`| **added** to \`${key}\` | \`${entry}\` |`);
      }
      for (const entry of b.permissions[key]) {
        if (!now.has(entry)) rows.push(`| removed from \`${key}\` | \`${entry}\` |`);
      }
    }
    if (b.permissions.defaultMode !== a.permissions.defaultMode) {
      rows.push(
        `| \`defaultMode\` | \`${b.permissions.defaultMode ?? "(unset)"}\` → \`${a.permissions.defaultMode ?? "(unset)"}\` |`
      );
    }
    if (rows.length > 0) {
      lines.push("| permission | entry |", "|---|---|", ...rows, "");
    } else {
      lines.push("No `permissions` entry changed.", "");
    }
    const keys = [...new Set([...Object.keys(b.rest), ...Object.keys(a.rest)])].sort();
    const moved = keys.filter((k) => JSON.stringify(b.rest[k]) !== JSON.stringify(a.rest[k]));
    if (moved.length > 0) {
      lines.push(
        `Other top-level keys that changed: ${moved.map((k) => `\`${k}\``).join(", ")}.`,
        ""
      );
    }
  }
  lines.push(
    "<details><summary><code>settings.json</code>, every changed line</summary>",
    "",
    "```diff",
    ...renderDiff(before, after),
    "```",
    "",
    "</details>"
  );
  return lines;
}

function renderFiles(
  label: string,
  before: { path: string; content: string }[],
  after: { path: string; content: string }[]
): string[] {
  const was = new Map(before.map((f) => [f.path, f.content]));
  const now = new Map(after.map((f) => [f.path, f.content]));
  const paths = [...new Set([...was.keys(), ...now.keys()])].sort();
  const rows: string[] = [];
  for (const p of paths) {
    const b = was.get(p);
    const a = now.get(p);
    if (b === undefined) rows.push(`- \`${label}${p}\` — **added** (${lineCounts("", a ?? "")})`);
    else if (a === undefined) rows.push(`- \`${label}${p}\` — **removed** (${lineCounts(b, "")})`);
    else if (a !== b) rows.push(`- \`${label}${p}\` — modified (${lineCounts(b, a)})`);
  }
  return rows;
}

/** What the mirror sync will hold this release to — the same constant the gate reads. */
const DEADLINE_NOTE =
  "The mirror sync withholds the CLI tag if the bundle misses upstream content that landed " +
  `more than ${RELEASE_STALENESS_TOLERANCE_HOURS} hours before this PR merges.`;

/** The markdown section, or a short statement that nothing moved. */
export function renderBundleDelta(before: BundlePayload, after: BundlePayload): string {
  if (before.sha === after.sha) {
    return [
      "### Bundled skills",
      "",
      `Unchanged: the bundle already pins \`${after.sha.slice(0, 10)}\`, upstream head when this release was cut.`,
      "",
      DEADLINE_NOTE
    ].join("\n");
  }

  const enforcement = [
    ...renderFiles("hooks/", before.HOOK_FILES, after.HOOK_FILES),
    ...renderFiles("agents/", before.AGENT_FILES, after.AGENT_FILES),
    ...(before.CLAUDE_MD === after.CLAUDE_MD
      ? []
      : [`- \`CLAUDE.md\` — modified (${lineCounts(before.CLAUDE_MD, after.CLAUDE_MD)})`])
  ];

  const slugs = [...new Set([...Object.keys(before.SKILLS), ...Object.keys(after.SKILLS)])].sort();
  const skills: string[] = [];
  for (const slug of slugs) {
    const rows = renderFiles(
      `skills/${slug}/`,
      before.SKILLS[slug]?.files ?? [],
      after.SKILLS[slug]?.files ?? []
    );
    if (!(slug in before.SKILLS))
      skills.push(`- \`${slug}\` — **new skill**, ${rows.length} file(s)`);
    else if (!(slug in after.SKILLS)) skills.push(`- \`${slug}\` — **removed**`);
    else if (rows.length > 0) skills.push(`- \`${slug}\` — ${rows.length} file(s) changed`);
  }
  const shared = renderFiles("skills/shared/", before.SHARED_FILES, after.SHARED_FILES);
  if (shared.length > 0) skills.push(`- \`shared\` — ${shared.length} file(s) changed`);

  const out = [
    "### Bundled skills",
    "",
    `This release re-cuts the skills bundled with \`@agent-nexus/cli\` at upstream head: ` +
      `\`${before.sha.slice(0, 10)}\` → \`${after.sha.slice(0, 10)}\` ` +
      `([compare](${UPSTREAM}/compare/${before.sha}...${after.sha})).`,
    "",
    "**Read the permission and hook changes before merging.** Merging this PR publishes them",
    "in the npm tarball, where they are installed by `nexus skills install --bundled` and by every",
    "install that falls back to the bundle.",
    "",
    DEADLINE_NOTE,
    "",
    "#### `settings.json`",
    "",
    ...renderSettings(before.SETTINGS_JSON, after.SETTINGS_JSON),
    "",
    "#### Hooks, agents and `CLAUDE.md`",
    "",
    ...(enforcement.length > 0 ? enforcement : ["None changed."]),
    "",
    "#### Skills",
    "",
    ...(skills.length > 0 ? skills : ["None changed."])
  ].join("\n");

  if (out.length <= MAX_CHARS) return out;
  return (
    out.slice(0, MAX_CHARS) +
    `\n\n> **Truncated at ${MAX_CHARS} characters.** The full change is the compare link above.`
  );
}

import type { SkillsCorpus } from "../../../skills-corpus/corpus";
import type { ClaudeTarget } from "../../../util/claude-target";
import {
  agentInstallables,
  bundleToInstallables,
  hookInstallables,
  type InstallableSkill,
  sharedInstallable
} from "../../../util/skills-install.installable";
import {
  claudeMdContent,
  settingsJsonContent
} from "../../../util/skills-install.preservable-content";
import type { SkillsInstallOpts } from "../_shared/skills-install.types";

/**
 * Everything one install will write, decided once and then only read.
 *
 * The plan is computed BEFORE anything is printed, so the plan the operator is
 * shown, the file count a `--dry-run` reports and the files a real run writes
 * are all derived from one object rather than from three recomputations that
 * could disagree.
 */
export interface InstallPlan {
  /** The named skills, in the corpus's own order. */
  readonly selected: readonly InstallableSkill[];
  /** `shared/` — the api-client + helpers the skill example scripts import. */
  readonly shared: InstallableSkill;
  /** `selected` plus `shared`: everything written under `skillsDir`. */
  readonly skillInstallables: readonly InstallableSkill[];
  /**
   * BYTES, never a string. `writeRootClaudeMd` takes a `Buffer`, and
   * `claudeMdContent()` produces one — declaring this `string` here typechecked
   * nowhere and broke both sides at once.
   */
  readonly claudeMdContent: Buffer;
  readonly installClaudeMd: boolean;
  /** Bytes, for the same reason as `claudeMdContent`. */
  readonly settingsContent: Buffer;
  readonly hooks: InstallableSkill;
  readonly installSettings: boolean;
  /**
   * `--global` was asked for and the posture is project-scoped, so it was
   * skipped. Distinct from `!installSettings`, which is also true when the
   * bundle simply ships no posture.
   */
  readonly settingsSkippedForGlobal: boolean;
  readonly agents: InstallableSkill;
  readonly installAgents: boolean;
  readonly totalFiles: number;
}

export function buildInstallPlan(
  corpus: SkillsCorpus,
  selectedSlugs: readonly string[],
  target: ClaudeTarget,
  opts: SkillsInstallOpts
): InstallPlan {
  const selected = bundleToInstallables(corpus, selectedSlugs);
  const shared = sharedInstallable(corpus);
  const skillInstallables = [...selected, shared];

  // CLAUDE.md is the cross-cutting Cue system prompt every SKILL.md
  // cross-references; it goes to the project root (not .claude/skills)
  // so Claude Code auto-loads it. Opt out with --no-claude-md.
  const content = claudeMdContent(corpus);
  const installClaudeMd = opts.claudeMd !== false && content.length > 0;

  // settings.json + hooks/ — the scoped permission posture. Coupled under one
  // opt-out (`--no-settings`): settings.json references the hooks, and the
  // hooks are inert without it, so installing one without the other is never
  // useful. Both are skipped when the bundle ships them empty.
  //
  // The posture is inherently PROJECT-scoped: settings.json invokes the hooks
  // via `${CLAUDE_PROJECT_DIR}/.claude/hooks/…`, which Claude Code resolves to
  // the open project at runtime — never `~/.claude/hooks`. Writing it to the
  // user-global `~/.claude` would (a) leave the global hooks unreachable and
  // (b) impose Nexus's permission rules on every project the user opens. So
  // for a global target we skip it and tell the user to install per-project.
  const settingsContent = settingsJsonContent(corpus);
  const hooks = hookInstallables(corpus);
  const settingsSupported = target.reason !== "global";
  const installSettings =
    opts.settings !== false &&
    settingsSupported &&
    settingsContent.length > 0 &&
    hooks.files.length > 0;
  const settingsSkippedForGlobal = opts.settings !== false && !settingsSupported;

  // agents/ — the Nexus-owned subagent definitions. Like the skill files and
  // shared/, they are always installed (no opt-out) and resolve fine at any
  // scope, so unlike settings.json + hooks they ship for --global too. Gated
  // only on the bundle actually carrying them (older bundles ship none).
  const agents = agentInstallables(corpus);
  const installAgents = agents.files.length > 0;

  const totalFiles =
    skillInstallables.reduce((acc, s) => acc + s.files.length, 0) +
    (installClaudeMd ? 1 : 0) +
    (installSettings ? hooks.files.length + 1 : 0) +
    (installAgents ? agents.files.length : 0);

  return {
    selected,
    shared,
    skillInstallables,
    claudeMdContent: content,
    installClaudeMd,
    settingsContent,
    hooks,
    installSettings,
    settingsSkippedForGlobal,
    agents,
    installAgents,
    totalFiles
  };
}

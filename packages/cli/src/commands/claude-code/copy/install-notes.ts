/**
 * `nexus claude-code install --help`'s after-block, in its own module so the
 * registrar stays inside the per-function line cap. Interpolated verbatim; the
 * bytes a reader sees are the bytes below.
 */
export const CLAUDE_CODE_INSTALL_NOTES = `
Examples:
  $ nexus claude-code install                                # Install all skills
  $ nexus claude-code install nexus-workflow-builder          # Install one skill
  $ nexus claude-code install nexus-agents nexus-deployments  # Install specific skills
  $ nexus claude-code install --dir ./my-skills               # Custom directory
  $ nexus claude-code install --dry-run                       # Preview only
  $ nexus claude-code install --force                         # Overwrite without prompting
  $ nexus claude-code install --no-claude-md                  # Skills only, leave CLAUDE.md alone
  $ nexus claude-code install --no-settings                   # Skip the settings.json + hooks posture
  $ nexus claude-code install --bundled                       # Offline: the skills bundled with this CLI
  $ nexus claude-code install --skills-ref 416b57391347212330eb85fc78f27f86b2303b59   # One exact commit

Tip: \`nexus skills update\` runs the same install but auto-detects your
project's existing .claude folder instead of always writing to the current
directory.

NAMING ONE SKILL NARROWS THE SKILLS AND NOTHING ELSE. A targeted install still
lays down the ENTIRE posture below — shared/, CLAUDE.md, settings.json, hooks/
and agents/ — so "install one skill" writes dozens of files, not the handful the
skill itself contains. The argument filters which skills are selected; it does
not make the install partial. Use --dry-run to see the file count before
committing to it, and --no-claude-md / --no-settings to actually opt out.

Alongside the skills, install writes:
  • shared/        — api-client + helpers the skill example scripts import
  • CLAUDE.md      — the cross-cutting Cue system prompt every SKILL.md
                     references; placed at the project root so Claude Code
                     auto-loads it. An existing, differing CLAUDE.md is
                     preserved unless --force is passed; skip it entirely
                     with --no-claude-md.
  • settings.json  — the scoped permission posture written to
                     .claude/settings.json. An existing, differing file is
                     preserved unless --force is passed.
  • hooks/         — the firewall + lifecycle hooks settings.json invokes,
                     written to .claude/hooks (Python marked executable).
                     Skip both settings.json and hooks with --no-settings.
  • agents/        — the Nexus subagent definitions, written to
                     .claude/agents and refreshed in place on every install.

Notes:
  YOUR OWN EDITS TO SKILLS, HOOKS AND AGENTS ARE NEVER OVERWRITTEN SILENTLY.
  Every install records a checksum of each file it writes, in
  .claude/.nexus-install-manifest.json. On the next install a file whose bytes
  still match that record is refreshed; a file whose bytes do not is LEFT ALONE,
  named in the output, and replaced only if you pass --force. A tree installed
  before this CLI kept that record has no checksums yet, so its differing files
  are preserved too — pass --force once to adopt them.

  --dir NAMES THE TARGET AND NOTHING IS COMPUTED FROM WHERE YOU STAND. For the
  conventional <root>/.claude/skills shape the posture goes to <root>/.claude and
  CLAUDE.md to <root>/CLAUDE.md, both derived from --dir. For any other path,
  everything — skills, CLAUDE.md, settings.json, hooks/, agents/ — lands inside
  the directory you named. Run "nexus skills where --dir <path>" to see every
  path before writing.

  WHERE THE SKILLS COME FROM. The latest skills corpus the platform serves, read
  with no API key: GET <base-url>/api/cli/skills/manifest, then the corpus it
  names, refused unless its bytes match the manifest's sha256. The skills
  repository's deploy publishes that corpus after its checks pass, so a skills
  change reaches this command without a new CLI release.
  WHEN THE PLATFORM CANNOT BE USED, THE BUNDLED SKILLS ARE INSTALLED INSTEAD —
  offline, a timeout, an error, a checksum mismatch, or a corpus that declares
  it needs a newer CLI (that last one also tells you to run "nexus upgrade").
  The reason is printed on stderr, and "corpus.fallbackReason" carries it under
  --json.
  --bundled installs the skills bundled with this CLI and makes no network call.
  --skills-ref <commit> installs exactly that commit and NEVER falls back: a pin
  that quietly installed something else would not be reproducible, so a failed
  read is an error. It takes the full 40-character sha.
  The commit installed is printed, and recorded as "corpus" in
  .claude/.nexus-install-manifest.json.`;

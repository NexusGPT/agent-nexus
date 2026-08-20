// AUTO-GENERATED — do not edit. Run: pnpm run gen:skills
// Source: NexusGPT/claude-code-skills-nexus@58028615b8a66cb1599291e273d2d05579a21b73
//
// The BULK of the bundled skills lives in `skills-content.generated.json`, beside
// this file, and is read on FIRST USE rather than compiled into the CLI bundle.
//
// Why: the payload was an 8.4 MB object literal in this module, so every `nexus`
// invocation paid to read and compile it — `--version` included, and every script
// that shells out in a loop. Measured on the built bundle: 10.40 MB / ~178 ms
// against 1.74 MB / ~86 ms with the payload removed. That is ~92 ms per
// invocation, about half of CLI startup, spent by every command that never reads
// this data. Only `skills`, `claude-code` and the installer ever touch it.
//
// `SKILLS_NEXUS_SHA` and the `// Source:` header above stay INLINE deliberately:
// `scripts/check-skills-lock.ts` reads both out of this file, and keeping them
// here means the `Skills bundle pinned` gate needs no network and no parse of the
// asset to answer "was this built from the pinned commit".

import fs from "node:fs";
import path from "node:path";

export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillEntry {
  slug: string;
  description: string;
  files: SkillFile[];
}

export const SKILLS_NEXUS_SHA: string = "58028615b8a66cb1599291e273d2d05579a21b73";

/** The shape written by `scripts/bundle-skills.ts` into the JSON asset. */
interface SkillsPayload {
  sha: string;
  SKILLS: Record<string, SkillEntry>;
  SKILL_LIST: string[];
  CLAUDE_MD: string;
  SHARED_FILES: SkillFile[];
  SETTINGS_JSON: string;
  HOOK_FILES: SkillFile[];
  AGENT_FILES: SkillFile[];
}

export const SKILLS_ASSET_FILENAME = "skills-content.generated.json";

/**
 * Resolved from `__dirname` rather than the process cwd, because the asset is a
 * SIBLING of this module in both trees: `src/` when run through tsx or vitest,
 * `dist/` in the published package. The CLI is built as CommonJS
 * (`tsup format: ["cjs"]`, no `"type": "module"` in package.json), so
 * `__dirname` is the correct resolver for the shipped artifact.
 */
export function skillsAssetPath(): string {
  return path.join(__dirname, SKILLS_ASSET_FILENAME);
}

/**
 * Parsed once per process. The cache is the whole point: a command that reads
 * the payload twice must not pay for it twice, and `skills install` reads
 * several of these getters in one run.
 */
let cached: SkillsPayload | null = null;

function load(): SkillsPayload {
  if (cached !== null) return cached;

  const assetPath = skillsAssetPath();
  let raw: string;
  try {
    raw = fs.readFileSync(assetPath, "utf-8");
  } catch (error) {
    // A missing asset means a broken INSTALL, not a broken argument — say which
    // file and stop, rather than surfacing a bare ENOENT from deep inside a
    // command that never mentions this path.
    throw new Error(
      `The bundled skills payload is missing: ${assetPath}\n` +
        `The published package ships it beside the CLI entrypoint. Reinstall @agent-nexus/cli, ` +
        `or run "pnpm run gen:skills" in a checkout.\n` +
        `Cause: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  let parsed: SkillsPayload;
  try {
    parsed = JSON.parse(raw) as SkillsPayload;
  } catch (error) {
    throw new Error(
      `The bundled skills payload is not valid JSON: ${assetPath}\n` +
        `Cause: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // The asset carries its own sha so a payload from a DIFFERENT generator run
  // cannot sit silently beside this module. `check-skills-lock.ts` asserts the
  // same equality at build time; this is the runtime half, and it matters
  // because the two files are shipped separately and can be replaced separately.
  // Checked BEFORE the comparison below, which slices it. A payload with no
  // `sha` would otherwise fail the `!==` test and then throw a bare TypeError
  // out of `.slice`, defeating the named error this loader exists to give.
  // `check-skills-lock.ts` reports the same case as ASSET_SHA_MISSING.
  if (typeof parsed.sha !== "string") {
    throw new Error(
      `The bundled skills payload carries no "sha" string: ${assetPath}\n` +
        `Both halves of the bundle are written by the same generator — ` +
        `run "pnpm run gen:skills" to regenerate them together.`
    );
  }

  if (parsed.sha !== SKILLS_NEXUS_SHA) {
    throw new Error(
      `The bundled skills payload was built from ${parsed.sha.slice(0, 12)} but this module ` +
        `pins ${SKILLS_NEXUS_SHA.slice(0, 12)}. The two halves of the bundle disagree — ` +
        `run "pnpm run gen:skills" to regenerate both.`
    );
  }

  cached = parsed;
  return cached;
}

/** Test-only: drop the parsed payload so the next getter re-reads from disk. */
export function resetSkillsCacheForTests(): void {
  cached = null;
}

export const getSkills = (): Record<string, SkillEntry> => load().SKILLS;
export const getSkillList = (): string[] => load().SKILL_LIST;
export const getClaudeMd = (): string => load().CLAUDE_MD;
export const getSharedFiles = (): SkillFile[] => load().SHARED_FILES;
export const getSettingsJson = (): string => load().SETTINGS_JSON;
export const getHookFiles = (): SkillFile[] => load().HOOK_FILES;
export const getAgentFiles = (): SkillFile[] => load().AGENT_FILES;

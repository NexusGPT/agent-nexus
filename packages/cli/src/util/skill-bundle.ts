import fs from "node:fs";
import path from "node:path";

import { readTarGz } from "./tar";
import { createZip, type ZipEntry } from "./zip";

/**
 * Turning a skill FOLDER (local, or one directory of the Anthropic skills repo)
 * into the ZIP `nexus agent-skill` uploads.
 *
 * The server-side limits are mirrored here so the CLI can name the offending
 * file. Rejected at the API they come back as one sentence about the archive
 * with no path in it, which is unactionable when the archive was assembled from
 * a directory the user never zipped by hand.
 */
export const SKILL_ZIP_LIMITS = {
  /** `CodeInterpreterSkillsService.MAX_ZIP_FILE_COUNT` */
  maxFiles: 500,
  /** `CodeInterpreterSkillsService.MAX_ZIP_SINGLE_FILE_SIZE` */
  maxFileBytes: 2 * 1024 * 1024,
  /** `CodeInterpreterSkillsService.MAX_ZIP_TOTAL_UNCOMPRESSED_SIZE` */
  maxTotalBytes: 20 * 1024 * 1024,
  /** `FileInterceptor` limit on the upload routes — applies to the ZIP itself. */
  maxUploadBytes: 5 * 1024 * 1024,
  /** `CodeInterpreterSkillsService.MAX_ZIP_PATH_LENGTH` */
  maxPathLength: 255
} as const;

/**
 * Files that are never part of a skill. Dropped rather than rejected: they turn
 * up in every real checkout, and failing on a `.DS_Store` would make the command
 * unusable on a Mac.
 */
const IGNORED_SEGMENTS = new Set([
  ".git",
  ".DS_Store",
  "__MACOSX",
  "Thumbs.db",
  "node_modules",
  "__pycache__",
  ".venv",
  ".pytest_cache"
]);

function isIgnored(name: string): boolean {
  return IGNORED_SEGMENTS.has(name) || name.endsWith(".pyc");
}

// ── Baseline presets ─────────────────────────────────────────────────────────

export interface SkillPreset {
  /** Skill name created on the agent. Also the sandbox directory name. */
  readonly name: string;
  /** Directory inside the source repo holding this skill's `SKILL.md`. */
  readonly repoPath: string;
  readonly description: string;
}

/**
 * The baseline skills a code-interpreter agent can be provisioned with, sourced
 * from Anthropic's public skills repository.
 *
 * **Fetched at run time rather than bundled into this package, deliberately.**
 * Each of these ships a `LICENSE.txt` reading "Use of these materials … is
 * governed by your agreement with Anthropic regarding use of Anthropic's
 * services" — they are Anthropic's materials, not ours to redistribute inside an
 * npm package. Fetching on demand also means `--ref` can pin or advance the
 * version without a CLI release, which matters for a set of skills that changes
 * upstream far more often than this CLI does.
 */
export const SKILL_PRESETS: Readonly<Record<string, SkillPreset>> = {
  "skill-creator": {
    name: "skill-creator",
    repoPath: "skills/skill-creator",
    description: "Design, validate, and package new Claude Code skills from inside the agent"
  },
  docx: {
    name: "docx",
    repoPath: "skills/docx",
    description: "Create, edit, and analyse Word documents"
  },
  pdf: {
    name: "pdf",
    repoPath: "skills/pdf",
    description: "Fill forms, merge, split, and extract from PDFs"
  },
  pptx: {
    name: "pptx",
    repoPath: "skills/pptx",
    description: "Build and edit PowerPoint decks"
  },
  xlsx: {
    name: "xlsx",
    repoPath: "skills/xlsx",
    description: "Read, write, and recalculate Excel workbooks"
  }
};

/** Aliases expanding to several presets. */
export const SKILL_PRESET_GROUPS: Readonly<Record<string, readonly string[]>> = {
  office: ["docx", "pdf", "pptx", "xlsx"],
  all: ["skill-creator", "docx", "pdf", "pptx", "xlsx"]
};

/** Default upstream source for the presets. */
export const DEFAULT_PRESET_REPO = "anthropics/skills";

/**
 * Expand preset names and group aliases into a deduplicated preset list,
 * preserving the order the user asked for.
 */
export function resolvePresets(names: readonly string[]): SkillPreset[] {
  const resolved: SkillPreset[] = [];
  const seen = new Set<string>();

  for (const raw of names) {
    const key = raw.trim().toLowerCase();
    const expanded = SKILL_PRESET_GROUPS[key] ?? [key];
    for (const presetName of expanded) {
      const preset = SKILL_PRESETS[presetName];
      if (!preset) {
        const known = [...Object.keys(SKILL_PRESETS), ...Object.keys(SKILL_PRESET_GROUPS)].join(
          ", "
        );
        throw new Error(`Unknown preset "${raw}". Available: ${known}`);
      }
      if (seen.has(preset.name)) continue;
      seen.add(preset.name);
      resolved.push(preset);
    }
  }

  if (resolved.length === 0) {
    throw new Error("No presets requested.");
  }
  return resolved;
}

/** The codeload URL a `<owner>/<repo>` + git ref resolves to. */
export function presetTarballUrl(repo: string, ref: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    throw new Error(`--repo must look like "owner/name", got "${repo}"`);
  }
  return `https://codeload.github.com/${repo}/tar.gz/${encodeURIComponent(ref)}`;
}

/** Download a repo tarball. Kept separate from parsing so tests can skip the network. */
export async function fetchTarball(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { accept: "application/gzip" } });
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url} — ${response.status} ${response.statusText}. ` +
        `Check the --repo and --ref values, or pass --from-dir to use a local checkout.`
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Pull one skill's files out of a repo tarball, stripping the archive's
 * generated root directory (`<repo>-<ref>/`) and the skill's own path prefix so
 * `SKILL.md` lands at the root of the resulting bundle.
 */
export function extractPresetFromTarball(tarball: Buffer, repoPath: string): ZipEntry[] {
  const entries = readTarGz(tarball);
  if (entries.length === 0) {
    throw new Error("Downloaded archive contained no files.");
  }

  // GitHub wraps everything in one generated top-level directory whose name
  // encodes the ref, so it cannot be hardcoded — take it from the first entry.
  const root = entries[0].path.split("/")[0];
  const prefix = `${root}/${repoPath}/`;

  const files: ZipEntry[] = [];
  for (const entry of entries) {
    if (!entry.path.startsWith(prefix)) continue;
    const relative = entry.path.slice(prefix.length);
    if (relative.length === 0) continue;
    if (relative.split("/").some((segment) => isIgnored(segment))) continue;
    files.push({ path: relative, content: entry.content });
  }

  if (files.length === 0) {
    throw new Error(
      `"${repoPath}" was not found in the downloaded archive. It may have been renamed or moved upstream.`
    );
  }
  if (!files.some((file) => file.path === "SKILL.md")) {
    throw new Error(`"${repoPath}" has no SKILL.md at its root — it is not a valid skill folder.`);
  }
  return files;
}

// ── Local directories ────────────────────────────────────────────────────────

/**
 * Collect a skill directory's files, rooted so `SKILL.md` sits at the top.
 *
 * Accepts either shape a user is likely to point at: the skill folder itself
 * (`./my-skill` containing `SKILL.md`), or a wrapper holding exactly one skill
 * folder (`./bundles` containing `my-skill/SKILL.md`). Anything else is an error
 * naming what was found, because the alternative is uploading a bundle the
 * server rejects for a reason phrased in terms of the ZIP rather than the
 * directory the user actually chose.
 *
 * Symlinks are skipped, not followed: a link can point outside the directory
 * being packaged, and a bundle assembled here is uploaded and later extracted
 * elsewhere.
 */
export function readSkillDirectory(dir: string): ZipEntry[] {
  const absolute = path.resolve(dir);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) {
    throw new Error(`Not a directory: ${absolute}`);
  }

  let root = absolute;
  if (!fs.existsSync(path.join(root, "SKILL.md"))) {
    const children = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((entry) => !isIgnored(entry.name))
      .filter((entry) => entry.isDirectory());
    const candidates = children.filter((entry) =>
      fs.existsSync(path.join(root, entry.name, "SKILL.md"))
    );
    if (candidates.length !== 1) {
      throw new Error(
        `${absolute} has no SKILL.md, and ${
          candidates.length === 0
            ? "none of its sub-directories has one either"
            : `${candidates.length} of its sub-directories do (${candidates
                .map((entry) => entry.name)
                .join(", ")})`
        }. Point --dir at the skill folder itself.`
      );
    }
    root = path.join(root, candidates[0].name);
  }

  const files: ZipEntry[] = [];
  const walk = (current: string, relative: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (isIgnored(entry.name)) continue;
      const childPath = path.join(current, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      // `withFileTypes` reports link types without following them, so this is
      // already an lstat-equivalent check.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(childPath, childRelative);
      } else if (entry.isFile()) {
        files.push({ path: childRelative, content: fs.readFileSync(childPath) });
      }
    }
  };
  walk(root, "");

  if (files.length === 0) {
    throw new Error(`${root} contains no files.`);
  }
  // The same closing check `extractPresetFromTarball` makes, and for the same
  // reason: the root above was chosen on `existsSync`, which answers TRUE for a
  // symlink named `SKILL.md` and for a DIRECTORY named `SKILL.md`, while the
  // walk collects neither — it skips symlinks by design and descends into
  // directories. Without this the bundle packs and uploads, and the server
  // rejects it with a sentence about the archive that never names the file.
  if (!files.some((file) => file.path === "SKILL.md")) {
    throw new Error(
      `${root} has no SKILL.md at its root — it is not a valid skill folder. ` +
        `A symlink or a directory named SKILL.md does not count: symlinks are ` +
        `skipped when packaging, so the bundle would upload without one.`
    );
  }
  return files;
}

// ── Packaging ────────────────────────────────────────────────────────────────

/**
 * Validate a collected file set against the server's ZIP limits and pack it.
 *
 * `label` names the source (a preset name or a directory) so an over-limit
 * bundle says which one blew the budget when several are packed in one command.
 */
export function packSkillZip(files: readonly ZipEntry[], label: string): Buffer {
  if (files.length > SKILL_ZIP_LIMITS.maxFiles) {
    throw new Error(
      `${label}: ${files.length} files exceeds the ${SKILL_ZIP_LIMITS.maxFiles}-file limit for a skill.`
    );
  }

  let total = 0;
  for (const file of files) {
    if (file.path.length > SKILL_ZIP_LIMITS.maxPathLength) {
      throw new Error(
        `${label}: path longer than ${SKILL_ZIP_LIMITS.maxPathLength} characters — ${file.path}`
      );
    }
    if (file.content.length > SKILL_ZIP_LIMITS.maxFileBytes) {
      throw new Error(
        `${label}: "${file.path}" is ${formatBytes(file.content.length)}, over the ` +
          `${formatBytes(SKILL_ZIP_LIMITS.maxFileBytes)} per-file limit.`
      );
    }
    total += file.content.length;
  }
  if (total > SKILL_ZIP_LIMITS.maxTotalBytes) {
    throw new Error(
      `${label}: ${formatBytes(total)} uncompressed, over the ` +
        `${formatBytes(SKILL_ZIP_LIMITS.maxTotalBytes)} limit for a skill.`
    );
  }

  const zip = createZip(files);
  if (zip.length > SKILL_ZIP_LIMITS.maxUploadBytes) {
    throw new Error(
      `${label}: the packed archive is ${formatBytes(zip.length)}, over the ` +
        `${formatBytes(SKILL_ZIP_LIMITS.maxUploadBytes)} upload limit. Remove large assets from the skill.`
    );
  }
  return zip;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Build-time script: fetches the canonical claude-code-skills-nexus tarball
 * from GitHub at the SHA pinned in `packages/cli/skills-nexus.lock`, extracts
 * it to a temp directory, and emits a TypeScript module with skill file
 * contents as string constants. This gets compiled into the CLI binary so
 * `nexus claude-code list` and `install` work without filesystem access.
 *
 * Run: pnpm run gen:skills
 *
 * Auth: requires GITHUB_TOKEN or GH_TOKEN in the environment. In CI, GitHub
 * Actions provides GITHUB_TOKEN automatically. Locally, the easiest is:
 *
 *   GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills
 *
 * If the lockfile is absent, the script fetches `main` HEAD, uses that SHA,
 * and writes the lockfile so subsequent runs are deterministic. Bump the
 * lockfile to upgrade the bundled skills.
 */

import { execSync } from "node:child_process";
import fs, { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(__dirname, "..");
const LOCK_FILE = path.join(CLI_ROOT, "skills-nexus.lock");
const OUTPUT_FILE = path.join(CLI_ROOT, "src", "skills-content.generated.ts");
const REPO = "NexusGPT/claude-code-skills-nexus";

interface FileEntry {
  path: string;
  content: string;
}

function escapeForTemplate(content: string): string {
  return content.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Recursively collect every file in a directory.
 *
 * This used to filter on `/\.(md|ts)$/`, which silently dropped every other
 * asset in the skills tree: JSON schemas, example specs, evaluation-suite
 * templates, and the .mjs/.sh/.py scripts the skill docs tell an agent to run.
 * Those files exist in skills-nexus and simply never reached a user, so an
 * instruction like "read `reference/pa-output-schema.json`" dead-ended on an
 * absent file at the far end of `nexus claude-code install`.
 *
 * The repo is the source of truth for what ships. An extension allowlist here
 * is a second, weaker source that drifts the moment someone adds a file type,
 * which is exactly how that bug arose — so there is no allowlist. Only editor
 * and OS cruft is skipped (dotfiles, __pycache__, compiled .pyc).
 */
function collectFiles(dir: string, basePath: string = ""): FileEntry[] {
  const entries: FileEntry[] = [];
  if (!fs.existsSync(dir)) return entries;

  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name.startsWith(".") || item.name === "__pycache__") continue;
    const relPath = basePath ? `${basePath}/${item.name}` : item.name;
    const fullPath = path.join(dir, item.name);

    if (item.isDirectory()) {
      entries.push(...collectFiles(fullPath, relPath));
    } else if (!item.name.endsWith(".pyc")) {
      entries.push({
        path: relPath,
        content: readUtf8OrThrow(fullPath, relPath)
      });
    }
  }

  return entries;
}

/**
 * Read a file as UTF-8, refusing anything that does not round-trip.
 *
 * The bundle stores contents as TypeScript string constants and the installer
 * writes them back with `Buffer.from(content, "utf-8")`, so a non-UTF-8 file
 * (an image, a font, a compiled binary) would be re-encoded with replacement
 * characters and written to disk corrupted — silently, since nothing compares
 * the bytes afterwards. Now that collection is unfiltered, the first binary
 * asset committed to skills-nexus would hit exactly that. Fail the build
 * instead: a broken build is fixable, a corrupted install is not diagnosable.
 */
function readUtf8OrThrow(fullPath: string, relPath: string): string {
  const raw = fs.readFileSync(fullPath);
  const decoded = raw.toString("utf-8");
  if (!Buffer.from(decoded, "utf-8").equals(raw)) {
    throw new Error(
      `${relPath} is not valid UTF-8. The skills bundle stores file contents as ` +
        `TypeScript strings, so binary assets cannot round-trip and would install ` +
        `corrupted. Either remove it from skills-nexus or teach the bundle to carry ` +
        `base64 payloads.`
    );
  }
  return decoded.trim();
}

/** Extract first meaningful paragraph from SKILL.md as description. */
function extractDescription(skillDir: string): string {
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) return "";

  const content = fs.readFileSync(skillMd, "utf-8");
  const lines = content.split("\n");

  let inFrontmatter = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed === "") continue;

    return trimmed.length > 120 ? trimmed.slice(0, 117) + "..." : trimmed;
  }

  return "";
}

function tryResolveToken(): string | null {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) return token;
  // Local-dev convenience: if gh-cli is installed and authed, grab its token.
  try {
    return execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

async function githubFetch(path: string, token: string): Promise<Response> {
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "nexus-cli-bundle-skills"
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} → ${res.status} ${res.statusText}`);
  }
  return res;
}

async function resolveSha(token: string): Promise<{ sha: string; source: "lock" | "main" }> {
  if (fs.existsSync(LOCK_FILE)) {
    const sha = fs.readFileSync(LOCK_FILE, "utf-8").trim();
    if (/^[a-f0-9]{40}$/i.test(sha)) {
      return { sha, source: "lock" };
    }
    console.warn(`Lock file ${LOCK_FILE} contains invalid SHA, falling back to main HEAD`);
  }
  const res = await githubFetch("/commits/main", token);
  const data = (await res.json()) as { sha: string };
  fs.writeFileSync(LOCK_FILE, data.sha + "\n", "utf-8");
  console.log(
    `Resolved ${REPO}@main → ${data.sha.slice(0, 12)} (wrote ${path.basename(LOCK_FILE)})`
  );
  return { sha: data.sha, source: "main" };
}

async function downloadAndExtractTarball(sha: string, token: string): Promise<string> {
  const res = await githubFetch(`/tarball/${sha}`, token);
  const buffer = Buffer.from(await res.arrayBuffer());

  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "skills-nexus-"));
  const tarPath = path.join(tmpRoot, "tarball.tar.gz");
  fs.writeFileSync(tarPath, buffer);

  // tar -xz extracts to a single top-level directory named like
  // "NexusGPT-claude-code-skills-nexus-<short-sha>/". Resolve the actual
  // name by listing after extraction — it depends on the repo/SHA.
  execSync(`tar -xzf "${tarPath}" -C "${tmpRoot}"`, { stdio: "pipe" });
  fs.unlinkSync(tarPath);

  const entries = fs.readdirSync(tmpRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
  if (entries.length !== 1) {
    throw new Error(
      `Expected exactly one top-level directory in the tarball, found ${entries.length}: ` +
        entries.map((d) => d.name).join(", ")
    );
  }
  return path.join(tmpRoot, entries[0].name);
}

async function main(): Promise<void> {
  const token = tryResolveToken();

  // Postinstall in CI runs this script without cross-repo auth. Treat the
  // committed skills-content.generated.ts as the source of truth in that
  // case — same model as a lockfile. If neither token nor committed bundle
  // exist, we genuinely can't proceed.
  if (!token) {
    if (fs.existsSync(OUTPUT_FILE)) {
      console.log(
        `No GITHUB_TOKEN / GH_TOKEN / gh-cli auth available — keeping committed ${path.basename(OUTPUT_FILE)} as-is.`
      );
      console.log(
        `To refresh from skills-nexus, run: GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills`
      );
      return;
    }
    throw new Error(
      `Cannot bootstrap the skills bundle: no GITHUB_TOKEN / GH_TOKEN / gh-cli auth, ` +
        `and no committed ${path.relative(process.cwd(), OUTPUT_FILE)} to fall back to.\n` +
        `Provide a token (GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills) or check the file in.`
    );
  }

  const { sha, source } = await resolveSha(token);
  console.log(`Building skills bundle from ${REPO}@${sha.slice(0, 12)} (source: ${source})`);

  const extracted = await downloadAndExtractTarball(sha, token);
  const skillsRoot = path.join(extracted, "skills");
  const claudeMdPath = path.join(extracted, "CLAUDE.md");
  const settingsJsonPath = path.join(extracted, "settings.json");
  const hooksRoot = path.join(extracted, "hooks");
  const agentsRoot = path.join(extracted, "agents");

  if (!fs.existsSync(skillsRoot)) {
    throw new Error(`Tarball is missing a top-level skills/ directory: ${skillsRoot}`);
  }

  const skillDirs = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("nexus-"))
    .map((d) => d.name)
    .sort();

  console.log(`Found ${skillDirs.length} skill directories`);

  const skillEntries: string[] = [];
  let totalFiles = 0;

  for (const slug of skillDirs) {
    const dir = path.join(skillsRoot, slug);
    const files = collectFiles(dir);
    const description = extractDescription(dir);
    totalFiles += files.length;

    const filesStr = files
      .map(
        (f) =>
          `      { path: ${JSON.stringify(f.path)}, content: \`${escapeForTemplate(f.content)}\` }`
      )
      .join(",\n");

    skillEntries.push(
      `  ${JSON.stringify(slug)}: {\n` +
        `    slug: ${JSON.stringify(slug)},\n` +
        `    description: ${JSON.stringify(description)},\n` +
        `    files: [\n${filesStr}\n    ],\n` +
        `  }`
    );
  }

  const claudeMd = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, "utf-8").trim() : "";

  const sharedFiles = collectFiles(path.join(skillsRoot, "shared"));
  const sharedStr = sharedFiles
    .map(
      (f) => `  { path: ${JSON.stringify(f.path)}, content: \`${escapeForTemplate(f.content)}\` }`
    )
    .join(",\n");

  // settings.json + hooks/ — the scoped permission posture (NEX-2461). The
  // top-level settings.json installs to .claude/settings.json; the hooks/ tree
  // (Python firewall + lib/ + docs) installs to .claude/hooks/.
  const settingsJson = fs.existsSync(settingsJsonPath)
    ? fs.readFileSync(settingsJsonPath, "utf-8").trim()
    : "";
  const hookFiles = collectFiles(hooksRoot);
  const hookFilesStr = hookFiles
    .map(
      (f) => `  { path: ${JSON.stringify(f.path)}, content: \`${escapeForTemplate(f.content)}\` }`
    )
    .join(",\n");
  console.log(
    `Found settings.json (${settingsJson.length} bytes) and ${hookFiles.length} hook files`
  );

  // agents/ — the Nexus-owned subagent definitions (flat .md files). They land
  // under .claude/agents and, like the skill files, are refreshed in place on
  // every install. Collected the same way skills/ and shared/ are.
  const agentFiles = collectFiles(agentsRoot);
  const agentFilesStr = agentFiles
    .map(
      (f) => `  { path: ${JSON.stringify(f.path)}, content: \`${escapeForTemplate(f.content)}\` }`
    )
    .join(",\n");
  console.log(`Found ${agentFiles.length} agent files`);

  const output = [
    "// AUTO-GENERATED — do not edit. Run: pnpm run gen:skills",
    `// Source: ${REPO}@${sha}`,
    "",
    "export interface SkillFile {",
    "  path: string;",
    "  content: string;",
    "}",
    "",
    "export interface SkillEntry {",
    "  slug: string;",
    "  description: string;",
    "  files: SkillFile[];",
    "}",
    "",
    `export const SKILLS: Record<string, SkillEntry> = {`,
    skillEntries.join(",\n"),
    "};",
    "",
    `export const SKILL_LIST: string[] = ${JSON.stringify(skillDirs)};`,
    "",
    `export const CLAUDE_MD: string = \`${escapeForTemplate(claudeMd)}\`;`,
    "",
    `export const SHARED_FILES: SkillFile[] = [`,
    sharedStr,
    "];",
    "",
    `export const SETTINGS_JSON: string = \`${escapeForTemplate(settingsJson)}\`;`,
    "",
    `export const HOOK_FILES: SkillFile[] = [`,
    hookFilesStr,
    "];",
    "",
    `export const AGENT_FILES: SkillFile[] = [`,
    agentFilesStr,
    "];",
    "",
    `export const SKILLS_NEXUS_SHA: string = ${JSON.stringify(sha)};`,
    ""
  ].join("\n");

  fs.writeFileSync(OUTPUT_FILE, output, "utf-8");

  // Best-effort cleanup of the extracted tarball.
  try {
    fs.rmSync(path.dirname(extracted), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log(
    `Generated ${path.relative(CLI_ROOT, OUTPUT_FILE)} ` +
      `(${skillDirs.length} skills, ${totalFiles} files, ${agentFiles.length} agents, ${output.length} bytes)`
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bundle-skills failed: ${msg}`);
  process.exit(1);
});

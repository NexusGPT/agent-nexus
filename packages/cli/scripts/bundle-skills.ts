/**
 * Build-time script: fetches the canonical claude-code-skills-nexus tarball
 * from GitHub at the SHA pinned in `packages/cli/skills-nexus.lock`, extracts
 * it to a temp directory, and emits the skills bundle the CLI ships with.
 *
 * THE BUNDLE IS THE FALLBACK (NEX-5177). `nexus skills install` installs the
 * latest corpus the platform serves, and uses this bundle only offline, on an
 * error, or with `--bundled`. Both go through `buildCorpusFromFiles`, so a
 * bundle and a download of the same commit install the same files.
 *
 * Run: pnpm run gen:skills
 *
 * Auth: requires GITHUB_TOKEN or GH_TOKEN in the environment. Locally, the
 * easiest is:
 *
 *   GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills
 *
 * CI HAS NO SUCH TOKEN, and the no-token branch in `main()` below is there
 * because of it. GitHub Actions does not put `GITHUB_TOKEN` in a step's
 * environment unless the workflow maps it in, and no job that installs this
 * workspace does — `.github/actions/setup` maps none. Even if one did, that
 * token is scoped to `NexusGPT/nexus` alone and this script reads a DIFFERENT,
 * private repository. So `scripts/postinstall.sh` runs `gen:skills` on every
 * install including CI, resolves nothing, and keeps the committed bundle.
 *
 * That is why the pin can go stale with nothing noticing, and why the check for
 * it is a scheduled job holding its own credential rather than anything on the
 * install path — `scripts/check-skills-drift.ts`.
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

import { buildCorpusFromFiles } from "../src/skills-corpus/build-corpus";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(__dirname, "..");
const LOCK_FILE = path.join(CLI_ROOT, "skills-nexus.lock");
const OUTPUT_FILE = path.join(CLI_ROOT, "src", "skills-content.generated.ts");

/**
 * The bulk payload, emitted BESIDE the module above and read at runtime rather
 * than compiled into the CLI bundle. `tsup.config.ts` copies it into `dist/`,
 * and `package.json` ships `files: ["dist"]`, so landing it there is what puts
 * it in the published tarball.
 */
const ASSET_BASENAME = "skills-content.generated.json";
const ASSET_FILE = path.join(CLI_ROOT, "src", ASSET_BASENAME);
const REPO = "NexusGPT/claude-code-skills-nexus";

/**
 * Every file under `root`, as a path relative to it with forward slashes.
 *
 * Nothing is filtered here and nothing is read. Which files ship is decided in
 * ONE place, `buildCorpusFromFiles` (src/skills-corpus/build-corpus.ts), which
 * the CLI also runs over a corpus it downloads — so the bundle and a download of
 * the same commit cannot disagree about what a skill contains.
 *
 * That selection has no extension allowlist, and the reason is recorded here
 * because this is where it was learned: collection used to filter on
 * `/\.(md|ts)$/`, which silently dropped every JSON schema, example spec and
 * .mjs/.sh/.py script the skill docs tell an agent to run. Only editor and OS
 * cruft is skipped (dotfiles, __pycache__, compiled .pyc).
 */
function listFiles(root: string, prefix = ""): string[] {
  const paths: string[] = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const relPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) paths.push(...listFiles(path.join(root, item.name), relPath));
    else paths.push(relPath);
  }
  return paths;
}

/**
 * Read a file as UTF-8, refusing anything that does not round-trip.
 *
 * The bundle stores contents as strings and the installer writes them back with
 * `Buffer.from(content, "utf-8")`, so a non-UTF-8 file (an image, a font, a
 * compiled binary) would be re-encoded with replacement characters and written
 * to disk corrupted — silently, since nothing compares the bytes afterwards.
 * Fail the build instead: a broken build is fixable, a corrupted install is not
 * diagnosable. Only files the corpus ships are ever read, so a binary file
 * somewhere no skill reaches does not fail the build.
 */
function readUtf8OrThrow(fullPath: string, relPath: string): string {
  const raw = fs.readFileSync(fullPath);
  const decoded = raw.toString("utf-8");
  if (!Buffer.from(decoded, "utf-8").equals(raw)) {
    throw new Error(
      `${relPath} is not valid UTF-8. The skills bundle stores file contents as ` +
        `strings, so binary assets cannot round-trip and would install ` +
        `corrupted. Either remove it from skills-nexus or teach the bundle to carry ` +
        `base64 payloads.`
    );
  }
  return decoded;
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
    // BOTH halves must be present. The module alone compiles and passes every
    // gate, then throws at runtime the first time a skills command reads the
    // payload — so a half-present bundle is worse here than an absent one.
    if (fs.existsSync(OUTPUT_FILE) && fs.existsSync(ASSET_FILE)) {
      console.log(
        `No GITHUB_TOKEN / GH_TOKEN / gh-cli auth available — keeping committed ${path.basename(OUTPUT_FILE)} + ${ASSET_BASENAME} as-is.`
      );
      console.log(
        `To refresh from skills-nexus, run: GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills`
      );
      return;
    }
    const missing = [OUTPUT_FILE, ASSET_FILE]
      .filter((f) => !fs.existsSync(f))
      .map((f) => path.relative(process.cwd(), f))
      .join(", ");
    throw new Error(
      `Cannot bootstrap the skills bundle: no GITHUB_TOKEN / GH_TOKEN / gh-cli auth, ` +
        `and the committed bundle is incomplete (missing: ${missing}).\n` +
        `Provide a token (GITHUB_TOKEN=$(gh auth token) pnpm run gen:skills) or check the files in.`
    );
  }

  const { sha, source } = await resolveSha(token);
  console.log(`Building skills bundle from ${REPO}@${sha.slice(0, 12)} (source: ${source})`);

  const extracted = await downloadAndExtractTarball(sha, token);
  if (!fs.existsSync(path.join(extracted, "skills"))) {
    throw new Error(`Tarball is missing a top-level skills/ directory: ${extracted}/skills`);
  }

  // The selection AND its report, in one call. The report names every top-level
  // entry under skills/ that was not bundled, on stderr, so a directory added
  // upstream that matches nothing cannot reach zero users in silence the way
  // `skills/plain/` did. See `select-skill-dirs.ts` for why it warns rather than
  // failing.
  const corpus = buildCorpusFromFiles(
    sha,
    {
      paths: listFiles(extracted),
      read: (relPath) => readUtf8OrThrow(path.join(extracted, relPath), relPath)
    },
    { log: (message) => console.log(message), warn: (message) => console.warn(message) }
  );
  const totalFiles = corpus.skillList.reduce((n, slug) => n + corpus.skills[slug].files.length, 0);
  console.log(
    `Found settings.json (${corpus.settingsJson.length} bytes) and ${corpus.hookFiles.length} hook files`
  );
  console.log(`Found ${corpus.agentFiles.length} agent files`);

  const output = [
    "// AUTO-GENERATED — do not edit. Run: pnpm run gen:skills",
    `// Source: ${REPO}@${sha}`,
    "//",
    "// The BULK of the bundled skills lives in `skills-content.generated.json`, beside",
    "// this file, and is read on FIRST USE rather than compiled into the CLI bundle.",
    "//",
    "// Why: the payload was an 8.4 MB object literal in this module, so every `nexus`",
    "// invocation paid to read and compile it — `--version` included, and every script",
    "// that shells out in a loop. Measured on the built bundle: 10.40 MB / ~178 ms",
    "// against 1.74 MB / ~86 ms with the payload removed. That is ~92 ms per",
    "// invocation, about half of CLI startup, spent by every command that never reads",
    "// this data. Only `skills`, `claude-code` and the installer ever touch it.",
    "//",
    "// `SKILLS_NEXUS_SHA` and the `// Source:` header above stay INLINE deliberately:",
    "// `scripts/check-skills-lock.ts` reads both out of this file, and keeping them",
    "// here means the `Skills bundle pinned` gate needs no network and no parse of the",
    '// asset to answer "was this built from the pinned commit".',
    "",
    'import fs from "node:fs";',
    'import path from "node:path";',
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
    `export const SKILLS_NEXUS_SHA: string = ${JSON.stringify(sha)};`,
    "",
    "/** The shape written by `scripts/bundle-skills.ts` into the JSON asset. */",
    "interface SkillsPayload {",
    "  sha: string;",
    "  SKILLS: Record<string, SkillEntry>;",
    "  SKILL_LIST: string[];",
    "  CLAUDE_MD: string;",
    "  SHARED_FILES: SkillFile[];",
    "  SETTINGS_JSON: string;",
    "  HOOK_FILES: SkillFile[];",
    "  AGENT_FILES: SkillFile[];",
    "}",
    "",
    `export const SKILLS_ASSET_FILENAME = ${JSON.stringify(ASSET_BASENAME)};`,
    "",
    "/**",
    " * Resolved from `__dirname` rather than the process cwd, because the asset is a",
    " * SIBLING of this module in both trees: `src/` when run through tsx or vitest,",
    " * `dist/` in the published package. The CLI is built as CommonJS",
    ' * (`tsup format: ["cjs"]`, no `"type": "module"` in package.json), so',
    " * `__dirname` is the correct resolver for the shipped artifact.",
    " */",
    "export function skillsAssetPath(): string {",
    "  return path.join(__dirname, SKILLS_ASSET_FILENAME);",
    "}",
    "",
    "/**",
    " * Parsed once per process. The cache is the whole point: a command that reads",
    " * the payload twice must not pay for it twice, and `skills install` reads",
    " * several of these getters in one run.",
    " */",
    "let cached: SkillsPayload | null = null;",
    "",
    "function load(): SkillsPayload {",
    "  if (cached !== null) return cached;",
    "",
    "  const assetPath = skillsAssetPath();",
    "  let raw: string;",
    "  try {",
    '    raw = fs.readFileSync(assetPath, "utf-8");',
    "  } catch (error) {",
    "    // A missing asset means a broken INSTALL, not a broken argument — say which",
    "    // file and stop, rather than surfacing a bare ENOENT from deep inside a",
    "    // command that never mentions this path.",
    "    throw new Error(",
    "      `The bundled skills payload is missing: ${assetPath}\\n` +",
    "        `The published package ships it beside the CLI entrypoint. Reinstall @agent-nexus/cli, ` +",
    '        `or run "pnpm run gen:skills" in a checkout.\\n` +',
    "        `Cause: ${error instanceof Error ? error.message : String(error)}`",
    "    );",
    "  }",
    "",
    "  let parsed: SkillsPayload;",
    "  try {",
    "    parsed = JSON.parse(raw) as SkillsPayload;",
    "  } catch (error) {",
    "    throw new Error(",
    "      `The bundled skills payload is not valid JSON: ${assetPath}\\n` +",
    "        `Cause: ${error instanceof Error ? error.message : String(error)}`",
    "    );",
    "  }",
    "",
    "  // The asset carries its own sha so a payload from a DIFFERENT generator run",
    "  // cannot sit silently beside this module. `check-skills-lock.ts` asserts the",
    "  // same equality at build time; this is the runtime half, and it matters",
    "  // because the two files are shipped separately and can be replaced separately.",
    "  // Checked BEFORE the comparison below, which slices it. A payload with no",
    "  // `sha` would otherwise fail the `!==` test and then throw a bare TypeError",
    "  // out of `.slice`, defeating the named error this loader exists to give.",
    "  // `check-skills-lock.ts` reports the same case as ASSET_SHA_MISSING.",
    '  if (typeof parsed.sha !== "string") {',
    "    throw new Error(",
    '      `The bundled skills payload carries no "sha" string: ${assetPath}\\n` +',
    "        `Both halves of the bundle are written by the same generator — ` +",
    '        `run "pnpm run gen:skills" to regenerate them together.`',
    "    );",
    "  }",
    "",
    "  if (parsed.sha !== SKILLS_NEXUS_SHA) {",
    "    throw new Error(",
    "      `The bundled skills payload was built from ${parsed.sha.slice(0, 12)} but this module ` +",
    "        `pins ${SKILLS_NEXUS_SHA.slice(0, 12)}. The two halves of the bundle disagree — ` +",
    '        `run "pnpm run gen:skills" to regenerate both.`',
    "    );",
    "  }",
    "",
    "  cached = parsed;",
    "  return cached;",
    "}",
    "",
    "/** Test-only: drop the parsed payload so the next getter re-reads from disk. */",
    "export function resetSkillsCacheForTests(): void {",
    "  cached = null;",
    "}",
    "",
    "export const getSkills = (): Record<string, SkillEntry> => load().SKILLS;",
    "export const getSkillList = (): string[] => load().SKILL_LIST;",
    "export const getClaudeMd = (): string => load().CLAUDE_MD;",
    "export const getSharedFiles = (): SkillFile[] => load().SHARED_FILES;",
    "export const getSettingsJson = (): string => load().SETTINGS_JSON;",
    "export const getHookFiles = (): SkillFile[] => load().HOOK_FILES;",
    "export const getAgentFiles = (): SkillFile[] => load().AGENT_FILES;",
    ""
  ].join("\n");

  const payload = {
    sha,
    SKILLS: corpus.skills,
    SKILL_LIST: corpus.skillList,
    CLAUDE_MD: corpus.claudeMd,
    SHARED_FILES: corpus.sharedFiles,
    SETTINGS_JSON: corpus.settingsJson,
    HOOK_FILES: corpus.hookFiles,
    AGENT_FILES: corpus.agentFiles
  };
  const payloadJson = JSON.stringify(payload);

  fs.writeFileSync(OUTPUT_FILE, output, "utf-8");
  fs.writeFileSync(ASSET_FILE, payloadJson, "utf-8");

  // Best-effort cleanup of the extracted tarball.
  try {
    fs.rmSync(path.dirname(extracted), { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  console.log(
    `Generated ${path.relative(CLI_ROOT, OUTPUT_FILE)} ` +
      `(${corpus.skillList.length} skills, ${totalFiles} files, ${corpus.agentFiles.length} agents) ` +
      `+ ${path.relative(CLI_ROOT, ASSET_FILE)} (${payloadJson.length} bytes)`
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`bundle-skills failed: ${msg}`);
  process.exit(1);
});

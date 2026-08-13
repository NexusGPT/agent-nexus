import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { resolveBaseUrl, type ResolvedProfile, resolveProfile } from "../config";
import { bindCommand } from "../contract-binding";
import { handleError } from "../errors";
import {
  color,
  type Column,
  isJsonMode,
  printRecord,
  printSuccess,
  printTable,
  printWarning
} from "../output";
import {
  claimMountPoint,
  describeOwner,
  type Engine,
  findMount,
  findMountsBySlug,
  LOG_DIR,
  mountKey,
  type MountRecord,
  type MountScope,
  readMounts,
  unmountMissMessage,
  writeMounts
} from "../workspace-mounts";
import {
  WORKSPACE_CREATE_CONTRACT,
  WORKSPACE_DELETE_CONTRACT,
  WORKSPACE_LIST_CONTRACT,
  WORKSPACE_RENAME_CONTRACT,
  WORKSPACE_RESTORE_CONTRACT,
  WORKSPACE_SEARCH_CONTRACT
} from "./workspace.contract.generated";

// ── Mount engines ─────────────────────────────────────────────────────────────
//
// The macFUSE-via-Recovery-mode requirement is macOS-specific to rclone's FUSE
// mount. So the default avoids FUSE entirely:
//   - macOS  → native WebDAV (`mount_webdav`) — built in, no kext, no Recovery.
//   - Linux  → rclone (FUSE is in-kernel; no extra driver, no root).
//   - Windows→ rclone (WinFsp — a normal installer, no Recovery mode).
// `--engine rclone|webdav` overrides the per-OS default.

function resolveEngine(requested: string | undefined): Engine {
  if (requested === "webdav" || requested === "rclone") return requested;
  if (requested && requested !== "auto") {
    throw new Error(`Unknown --engine "${requested}". Use "auto", "webdav", or "rclone".`);
  }
  // auto: native WebDAV on macOS (no macFUSE), rclone elsewhere.
  return process.platform === "darwin" ? "webdav" : "rclone";
}

// ── Mount state (so `unmount`/`status` can find the mount again) ──────────────
// The registry record/IO lives in ../workspace-mounts, org-scoped per NEX-2360:
// keys are `<kind>:<acting-org>|<slug>` — the kind tag (`org:`/`profile:`/`url:`)
// keeps a profile named after an org id out of that org's key space — and each
// record pins the org/profile + ro/rw mode it was mounted with (NEX-2372).
// Legacy bare-slug records stay readable.

/** True if a PID is a live process we can signal. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** True if `mountPath` is currently an active mount point (used for native mounts). */
function isMountPoint(mountPath: string): boolean {
  // macOS lists the realpath in the mount table (e.g. /tmp → /private/tmp), so
  // compare against the resolved path — otherwise a live native mount under a
  // symlinked dir reads as "not mounted" (wrong `status`, bypassed re-mount
  // guard). Fall back to the raw path if it can't be resolved (e.g. unmounted).
  let resolved = mountPath;
  try {
    resolved = fs.realpathSync(mountPath);
  } catch {
    /* keep the raw path */
  }
  try {
    const out = execFileSync("mount", [], { encoding: "utf-8" });
    return out
      .split("\n")
      .some((line) => line.includes(` on ${resolved} `) || line.includes(` on ${mountPath} `));
  } catch {
    return false;
  }
}

/** Liveness of a recorded mount, regardless of engine. */
function isMountLive(record: MountRecord): boolean {
  return record.engine === "rclone"
    ? typeof record.pid === "number" && isAlive(record.pid)
    : isMountPoint(record.mountPath);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * The acting org for a resolved credential — the org the server will serve for
 * it. Resolved EXACTLY the way `createClient` resolves the organization-id for
 * API calls: `NEXUS_ORGANIZATION_ID` env override first, then the profile's
 * selected org (NEX-2474). Post NEX-3175 a mismatched override 403s server-side
 * instead of silently answering from another org, so this resolution is
 * deterministic at mount time; the registry pins it and `auth use-org` switches
 * later never retarget an existing mount.
 *
 * The org NAME is only known when the acting org is the profile's own org; an
 * env override naming a different org yields an id but no name.
 */
export function actingScope(resolved: ResolvedProfile, baseUrl: string): MountScope {
  const profileOrgId = resolved.profile.orgId;
  const orgId = process.env.NEXUS_ORGANIZATION_ID || profileOrgId;
  return {
    profile: resolved.source === "override" ? undefined : resolved.name,
    orgId,
    orgName: orgId && orgId === profileOrgId ? resolved.profile.orgName : undefined,
    baseUrl
  };
}

/** Resolve the API key + base URL + acting-org scope from the SDK's auth chain. */
export function resolveAuth(opts: { apiKey?: string; baseUrl?: string; profile?: string }): {
  apiKey: string;
  baseUrl: string;
  scope: MountScope;
} {
  const resolved = resolveProfile(opts);
  const apiKey = opts.apiKey ?? resolved.profile.apiKey;
  if (!apiKey) {
    throw new Error("No API key. Run `nexus auth login` or pass --api-key.");
  }
  const baseUrl = (
    opts.baseUrl ||
    process.env.NEXUS_BASE_URL ||
    resolved.profile.baseUrl ||
    resolveBaseUrl()
  ).replace(/\/$/, "");
  const scope = actingScope(resolved, baseUrl);
  if (!scope.orgId && !scope.profile) {
    // Raw --api-key/NEXUS_API_KEY with no org resolution: the acting org is
    // unknowable client-side. Record the mount in the base-URL fallback bucket
    // and say so loudly — `status` will show "?" and `unmount` matches by slug.
    printWarning(
      "Cannot determine the organization this mount will serve.",
      "The API key was passed directly (--api-key/NEXUS_API_KEY) and no NEXUS_ORGANIZATION_ID is set,",
      "so the mount is recorded without an org and scoped by base URL only.",
      "Prefer `nexus auth login` (or set NEXUS_ORGANIZATION_ID) so status/unmount can tell orgs apart."
    );
  }
  return { apiKey, baseUrl, scope };
}

/**
 * Resolve the acting-org scope for `unmount` without requiring auth. Unmount
 * operates purely on the local registry, so a user with no configured profile
 * must still be able to run it — resolution failures fall back to `undefined`,
 * and the registry lookup then matches by slug.
 *
 * A raw `--api-key`/`NEXUS_API_KEY` override with no NEXUS_ORGANIZATION_ID also
 * resolves to `undefined`: it carries no org or profile identity (only a base
 * URL), so scoping the lookup by it would hide a row written under a real
 * org/profile key. Treating it as an unknown scope lets `findMount` fall back
 * to a slug match instead.
 *
 * That fallback is deliberately NARROW, because `undefined` here is also what a
 * typo'd `--profile` produces (the profile lookup throws and the `catch` below
 * swallows it, error and all). `findMount` will hand back a unique slug match
 * only when the record names NO org or profile; anything owned makes the caller
 * list the candidates and ask the user to name one. Otherwise a mistyped flag
 * would silently OS-detach and delete another org's mount.
 */
function resolveScopeBestEffort(opts: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}): MountScope | undefined {
  try {
    const resolved = resolveProfile(opts);
    const baseUrl = (
      opts.baseUrl ||
      process.env.NEXUS_BASE_URL ||
      resolved.profile.baseUrl ||
      resolveBaseUrl()
    ).replace(/\/$/, "");
    const scope = actingScope(resolved, baseUrl);
    if (!scope.orgId && !scope.profile) return undefined;
    return scope;
  } catch {
    return undefined;
  }
}

function rcloneInstalled(): boolean {
  try {
    execFileSync("rclone", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function rcloneInstallHint(): string {
  const lines = [
    color.red("Error:") + " rclone is required for `--engine rclone` but was not found on PATH.",
    "",
    "Install it:"
  ];
  if (process.platform === "darwin") {
    lines.push("  brew install rclone");
    lines.push(
      "  (rclone on macOS also needs macFUSE — a kernel extension requiring a Recovery-mode"
    );
    lines.push(
      "   approval. To avoid that entirely, drop --engine and use the default native WebDAV mount.)"
    );
  } else if (process.platform === "win32") {
    lines.push("  winget install Rclone.Rclone   (also install WinFsp: https://winfsp.dev)");
  } else {
    lines.push("  sudo -v ; curl https://rclone.org/install.sh | sudo bash");
    lines.push("  (also needs FUSE: sudo apt-get install fuse3)");
  }
  lines.push("", "Then re-run `nexus workspace mount <slug>`.");
  return lines.join("\n");
}

/** Workspace slugs are slugified server-side: lowercase alphanumeric + hyphens. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Reject anything that isn't a real workspace slug before it reaches
 * `path.join`/`path.resolve` (mount point) or the mount URL. Without this a
 * slug like `..` or `../foo` resolves the mount point outside `~/nexus`.
 */
function assertMountableSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `Invalid workspace slug "${slug}". Slugs are lowercase letters, digits, and hyphens. ` +
        `Run \`nexus workspace list\` to see valid slugs.`
    );
  }
}

function defaultMountPath(slug: string): string {
  return path.join(os.homedir(), "nexus", slug);
}

/** What `resolveMountTarget` learned about the slug we're about to mount. */
interface MountTarget {
  /** True when an admin-shared workspace owns this slug. */
  shared: boolean;
  /** True when the calling org owns a workspace with this slug. */
  orgOwned: boolean;
  /** Immutable id of the copy we'll actually mount (the chosen one). */
  workspaceId?: string;
}

/**
 * Inspect the org's workspace list to learn whether `slug` is owned by an
 * org-owned workspace, an admin-shared one, or both — and pick the id of the
 * copy the mount will serve (shared when `wantShared`, else org-owned-first,
 * matching the server's bare-slug resolution). Returns null if the list can't
 * be fetched, so the caller falls back to a plain bare-slug mount.
 */
export async function resolveMountTarget(
  client: ReturnType<typeof createClient>,
  slug: string,
  wantShared: boolean
): Promise<MountTarget | null> {
  let workspaces: { id: string; slug: string; isShared: boolean }[];
  try {
    ({ workspaces } = await client.workspaces.list());
  } catch {
    return null;
  }
  const matches = workspaces.filter((w) => w.slug === slug);
  const shared = matches.find((w) => w.isShared);
  const orgOwned = matches.find((w) => !w.isShared);
  const chosen = wantShared ? shared : (orgOwned ?? shared);
  return {
    shared: !!shared,
    orgOwned: !!orgOwned,
    workspaceId: chosen?.id
  };
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** FUSE/WebDAV want an empty, existing dir; create it (and its parent). */
function ensureEmptyMountDir(mountPath: string): void {
  fs.mkdirSync(mountPath, { recursive: true });
  const entries = fs.readdirSync(mountPath);
  if (entries.length > 0) {
    throw new Error(
      `Mount point ${mountPath} is not empty. Choose another with --at <path> or clear it first.`
    );
  }
}

// ── Native WebDAV (macOS `mount_webdav`) ──────────────────────────────────────

/** Mint a scoped, expiring mount token from the API key (header auth). */
async function mintMountToken(baseUrl: string, apiKey: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/dav/_token`, { headers: { "api-key": apiKey } });
  if (!res.ok) {
    throw new Error(`Failed to mint a mount token (HTTP ${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error("The mount-token endpoint returned no token.");
  return body.token;
}

async function mountWebdav(
  slug: string,
  davPath: string,
  baseUrl: string,
  apiKey: string,
  mountPath: string,
  readOnly: boolean
): Promise<MountRecord> {
  if (process.platform !== "darwin") {
    throw new Error(
      "The native WebDAV engine is currently macOS-only. On Linux/Windows use `--engine rclone` " +
        "(Linux FUSE is built-in; Windows uses WinFsp — neither needs macFUSE/Recovery mode)."
    );
  }

  // `mount_webdav` rejects a URL that carries Basic userinfo OR a query string
  // (IllegalURLComponent — it bails before connecting) and can't send custom
  // headers, and its keychain path is unreliable/interactive. So authenticate
  // with a scoped, expiring token carried in the URL PATH, which the gateway
  // strips before anything logs the request line. Trade-off: the token is
  // visible in this mount process's argv to the same local user — it's scoped +
  // expiring (not the raw key); use `--engine rclone` if even that matters.
  const token = await mintMountToken(baseUrl, apiKey);
  const url = `${baseUrl}/api/dav/_t/${encodeURIComponent(token)}/${davPath}`;

  const args: string[] = [];
  if (readOnly) args.push("-o", "ro");
  args.push(url, mountPath);
  try {
    execFileSync("mount_webdav", args, { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(
      `mount_webdav failed${stderr ? `: ${stderr}` : ""}.\n` +
        `If this is a self-signed/dev server, the native client requires a trusted HTTPS cert; ` +
        `use \`--engine rclone\` there instead.`
    );
  }
  return {
    slug,
    engine: "webdav",
    mountPath,
    baseUrl,
    mountedAt: new Date().toISOString()
  };
}

// ── rclone (FUSE) ─────────────────────────────────────────────────────────────

async function mountRclone(
  slug: string,
  url: string,
  baseUrl: string,
  apiKey: string,
  mountPath: string,
  readOnly: boolean
): Promise<MountRecord> {
  if (!rcloneInstalled()) {
    throw new Error(rcloneInstallHint());
  }

  // Configure the WebDAV backend via RCLONE_* env vars so the API key stays out
  // of argv (and the process list).
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${slug}.log`);
  const logFd = fs.openSync(logPath, "a");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RCLONE_WEBDAV_URL: url,
    RCLONE_WEBDAV_VENDOR: "other",
    RCLONE_WEBDAV_HEADERS: `api-key,${apiKey}`
  };
  const args = [
    "mount",
    ":webdav:",
    mountPath,
    // Tuned for freshness (live shared drive) over aggressive caching.
    "--vfs-cache-mode",
    "writes",
    "--dir-cache-time",
    "5s",
    "--poll-interval",
    "5s"
  ];
  if (readOnly) args.push("--read-only");

  const child: ChildProcess = spawn("rclone", args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env
  });

  // Give rclone a moment to fail fast. Listen for BOTH "error" (spawn failed —
  // ENOENT/EACCES; an unhandled "error" would otherwise crash the CLI) and
  // "exit" (started but bailed: bad creds, missing FUSE, etc.). null = running.
  const startFailure = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 2000);
    child.once("error", (err) => {
      clearTimeout(timer);
      resolve(`failed to start rclone: ${err.message}`);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(`rclone exited immediately (code ${code ?? 1})`);
    });
  });

  if (startFailure !== null) {
    let tail = "";
    try {
      tail = fs.readFileSync(logPath, "utf-8").trim().split("\n").slice(-10).join("\n");
    } catch {
      /* log may not exist if spawn never started */
    }
    throw new Error(
      `${startFailure}.${tail ? `\nRecent log:\n${tail}` : ""}\n\nFull log: ${logPath}`
    );
  }

  child.unref(); // detach so this CLI process can exit while the mount lives on
  return {
    slug,
    engine: "rclone",
    mountPath,
    baseUrl,
    pid: child.pid,
    mountedAt: new Date().toISOString()
  };
}

// ── CLAUDE.md note (so a local Claude Code knows the drive is live + shared) ──

const CLAUDE_MD_BEGIN = "<!-- nexus-workspace:begin -->";
const CLAUDE_MD_END = "<!-- nexus-workspace:end -->";

function workspaceClaudeMdSection(slug: string, mountPath: string, readOnly: boolean): string {
  const mode = readOnly ? "read-only" : "read-write";
  return [
    CLAUDE_MD_BEGIN,
    `## Nexus Workspace`,
    ``,
    `The Nexus workspace \`${slug}\` is mounted at \`${mountPath}\` (${mode}).`,
    ``,
    `- It is **live shared team storage** — other people and agents (including Ultimate Cue)`,
    `  may read and write the same files concurrently. Re-read a file before relying on`,
    `  cached contents; writes are last-write-wins per file.`,
    `- Treat it like a normal directory: \`bash\`, \`python\`, Read/Write/Glob all work on it.`,
    readOnly
      ? `- This mount is read-only; do not attempt to modify files under it.`
      : `- Changes you save propagate to the shared workspace within a few seconds.`,
    CLAUDE_MD_END
  ].join("\n");
}

/** Insert or replace the managed Nexus-workspace block in ./CLAUDE.md. */
function writeClaudeMdNote(slug: string, mountPath: string, readOnly: boolean): string {
  const target = path.join(process.cwd(), "CLAUDE.md");
  const section = workspaceClaudeMdSection(slug, mountPath, readOnly);
  let content = "";
  try {
    content = fs.readFileSync(target, "utf-8");
  } catch {
    /* file doesn't exist yet */
  }

  const begin = content.indexOf(CLAUDE_MD_BEGIN);
  const end = content.indexOf(CLAUDE_MD_END);
  if (begin !== -1 && end !== -1 && end > begin) {
    const before = content.slice(0, begin).replace(/\n*$/, "");
    const after = content.slice(end + CLAUDE_MD_END.length).replace(/^\n*/, "");
    content = [before, section, after].filter(Boolean).join("\n\n") + "\n";
  } else {
    content = (content ? content.replace(/\n*$/, "") + "\n\n" : "") + section + "\n";
  }
  fs.writeFileSync(target, content);
  return target;
}

// ── Commands ──────────────────────────────────────────────────────────────────

export function registerWorkspaceCommands(program: Command): void {
  const ws = program
    .command("workspace")
    .description("Mount Nexus workspaces as a live shared drive for local Claude Code");

  ws.addHelpText(
    "after",
    `
TWO GROUPS OF SUBCOMMAND, AND THEY FAIL FOR OPPOSITE REASONS.

  Public API v1 (need a valid key and the network):
    list · create · rename · delete · search · restore
  This machine's mount registry (no Public API call):
    mount · unmount · status

"unmount" and "status" keep working after a key is revoked or while offline —
they report what THIS machine recorded, never what the server holds. "mount" is
in the local group but still reaches the server over WebDAV, authenticating with
your API key, so it is the one local-group command a revoked key breaks.

A mounted workspace deleted server-side still appears in "status". When the two
disagree, "list" is the truth and "status" is the local record.

THE DRIVE IS LIVE AND SHARED. Teammates and agents read and write the same
files within seconds, and writes are last-write-wins per file. There is no
checkout, no lock you can rely on and no merge — re-read before you overwrite.

IT IS NOT A POSIX FILESYSTEM. It is WebDAV behind a userspace mount, so
in-place edits are not supported: mv, sed -i and >> answer "Function not
implemented". Read the file, transform it in memory, and write the whole file
back. Ordinary create / read / overwrite / delete all work.

SCOPES ARE NOT HIERARCHICAL. workspaces:read is enough to MOUNT and to read.
Writing needs workspaces:write, and DELETING NEEDS workspaces:delete, which
write does NOT imply — a read-write mount whose key lacks it fails every rm
with a 403 while cp keeps working.

MOUNTING NEEDS rclone ON LINUX AND WINDOWS (the default engine there):
  Linux    sudo -v ; curl https://rclone.org/install.sh | sudo bash
           sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    nothing to install — the default engine is the native WebDAV mount.

A SLUG IS NOT UNIQUE. The same slug can name both an org-owned workspace and
an admin-shared one; the bare slug resolves to the org-owned copy and --shared
picks the other.

THERE IS NO UPLOAD VERB HERE, AND THAT IS THE FIRST THING PEOPLE LOOK FOR. This
namespace creates, mounts and searches workspaces; it never puts a file into
one. Two routes do:

  1. Mount it and write through the drive — the normal way.
  2. WebDAV directly, when a mount is not available (CI, a container):
       $ curl -X PUT -u "$NEXUS_API_KEY:" --data-binary @local.md \\
           <base-url>/webdav/<slug>/notes/local.md

To LIST what is in a workspace without mounting, "workspace search" answers
server-side — and one raw read gives you a plain directory listing:

  $ nexus api GET /workspaces/<slug>/files --query path=<dir>

Neither listing needs a mount, which makes them the cheap answer to "is my file
there" — the question that otherwise drives a mount.`
  );

  // ── list ─────────────────────────────────────────────────────────────────
  const list = ws
    .command("list")
    .description("List the workspaces in your organization")
    .option(
      "--folder-stats",
      "Include a per-top-level-folder breakdown (depth-1) in each workspace's stats"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace list
  $ nexus workspace list --json
  $ nexus workspace list --folder-stats --json

Notes:
  READ THE KIND COLUMN BEFORE YOU MOUNT. "org" is your organization's own
  workspace, "shared" is an admin-shared one. Two rows can carry the SAME slug,
  one of each — the bare slug then mounts the org copy and --shared the other.
  🚨 THE TABLE'S "KIND" AND --json's "kind" ARE DIFFERENT FIELDS WITH THE SAME
  NAME. The column above shows OWNERSHIP (org / shared); the JSON key literally
  called kind shows the STORAGE TYPE (CODE / DRIVE), which is the sense
  "workspace create" documents. So a script reading .kind and testing for
  "org" or "shared" never matches, and one testing for "CODE" is answering a
  different question than the table. In --json, ownership is isShared.
  --folder-stats ADDS A COUNT, NOT THE FOLDERS. It costs a depth-1 walk
  server-side, the table shows only how many top-level folders there are, and
  the per-folder breakdown is --json only.
  Files and Size are server-side totals for the whole workspace; they say
  nothing about whether it is mounted.
  Needs workspaces:read. Unpaginated.`
    )
    .action(async (opts: { folderStats?: boolean }) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { workspaces } = await client.workspaces.list({ folderStats: opts.folderStats });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspaces, null, 2));
          return;
        }
        // Surface which copy is which: a slug can name both an org-owned and an
        // admin-shared workspace, and the bare slug mounts the org-owned one
        // (NEX-2362). The "Kind" column makes the collision visible at a glance.
        const rows = workspaces.map((w) => ({
          slug: w.slug,
          name: w.name,
          kind: w.isShared ? "shared" : "org",
          files: w.stats.fileCount,
          size: formatBytes(w.stats.totalBytes),
          ...(opts.folderStats ? { folders: w.stats.folders?.length ?? 0 } : {})
        }));
        // Hoisted so the conditional gets a contextual type. Spread inline, the
        // best-common-type of `[]` and the one-element literal widens `key` to
        // `string` and takes the whole column list out of the key check.
        const folderColumn: Column<(typeof rows)[number]>[] = opts.folderStats
          ? [{ key: "folders", label: "Folders" }]
          : [];
        printTable(rows, [
          { key: "slug", label: "Slug" },
          { key: "name", label: "Name" },
          { key: "kind", label: "Kind" },
          { key: "files", label: "Files" },
          { key: "size", label: "Size" },
          ...folderColumn
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── search ─────────────────────────────────────────────────────────────────
  const search = ws
    .command("search")
    .description("Search a workspace's docs server-side by keyword and/or frontmatter (no mount)")
    .argument("<slug>", "Workspace slug")
    .option(
      "--query <text>",
      "Keyword (case-insensitive substring over content, frontmatter, path)"
    )
    .option(
      "--frontmatter <key=value>",
      "Frontmatter filter (repeatable); all must hold, e.g. --frontmatter status=done",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[]
    )
    .option("--path <folder>", "Restrict the search to a subfolder (workspace-relative)")
    .option("--limit <n>", "Max results to return (1–200, default 50)", (v) => parseInt(v, 10))
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace search support-docs --query "refund policy"
  $ nexus workspace search support-docs --frontmatter status=published
  $ nexus workspace search support-docs --query onboarding --frontmatter owner=growth --json
  $ nexus workspace search support-docs --query api --path guides --limit 20

Notes:
  TEXT DOCUMENTS ONLY, BY EXTENSION. Markdown, txt, json/jsonl, yaml and their
  siblings are read; a PDF, an image, a binary or a file with NO EXTENSION is
  never opened, so its content cannot match and its absence is not reported.
  This is a document search, not a file search.
  IT STOPS AFTER 1000 FILES AND SAYS SO QUIETLY. Past that the answer is
  incomplete and truncated is true — the table prints "(truncated — narrow your
  search)" on STDERR and --json carries the flag. AN EMPTY RESULT WITH
  truncated: true IS NOT "NO MATCHES". Narrow with --path and try again.
  LARGE FILES ARE READ AS A PREFIX ONLY (first 256 KB), so a match deep inside
  a big document is missed silently.
  Every --frontmatter key=value must hold, ANDed with --query. Repeat the flag
  for several. Values are compared as the flattened string form of the
  frontmatter, so a list matches its ", "-joined rendering.
  At least one of --query / --frontmatter is required; the CLI refuses locally
  rather than scanning everything.
  MATCHED tells you WHERE it hit — content, frontmatter or path. A path-only
  hit has no snippet, which is why SNIPPET can be blank on a real match.
  🚨 A NON-TEXT FILE CANNOT BE FOUND BY ITS PATH EITHER, ONLY BY ITS CONTENT.
  Non-text files are dropped before matching runs, so the path axis never
  applies to them: searching an image's EXACT filename answers "No matches",
  which reads as "that file is not in this workspace" when it is sitting there.
  Confirm with a mount or with "nexus api GET /workspaces/<slug>/files
  --query path=<dir>" before believing an absence.
  scanned (STDERR, or --json) is how many files were actually opened, not how
  many exist.
  No mount needed, and no local files are read — this runs server-side.`
    )
    .action(
      async (
        slug: string,
        opts: { query?: string; frontmatter: string[]; path?: string; limit?: number }
      ) => {
        try {
          if (!opts.query && opts.frontmatter.length === 0) {
            throw new Error(
              "Provide --query and/or at least one --frontmatter key=value filter to search."
            );
          }
          for (const f of opts.frontmatter) {
            if (!f.includes("=") || f.split("=", 1)[0].trim().length === 0) {
              throw new Error(
                `Invalid --frontmatter "${f}". Use key=value form with a non-empty key.`
              );
            }
          }

          const client = createClient(program.optsWithGlobals());
          const res = await client.workspaces.search(slug, {
            query: opts.query,
            frontmatter: opts.frontmatter.length > 0 ? opts.frontmatter : undefined,
            path: opts.path,
            limit: opts.limit
          });

          if (isJsonMode()) {
            console.log(JSON.stringify(res, null, 2));
            return;
          }

          if (res.results.length === 0) {
            console.log(`No matches (scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}).`);
            return;
          }

          printTable(
            res.results.map((hit) => ({
              path: hit.path,
              match: hit.matchedIn.join(", "),
              snippet: (hit.snippet ?? "").replace(/\s+/g, " ").slice(0, 80)
            })),
            [
              { key: "path", label: "Path" },
              { key: "match", label: "Matched" },
              { key: "snippet", label: "Snippet" }
            ]
          );
          const shown = `${res.results.length} match${res.results.length === 1 ? "" : "es"}`;
          const scanned = `scanned ${res.scanned} file${res.scanned === 1 ? "" : "s"}`;
          console.error(
            color.dim(
              `${shown}, ${scanned}${res.truncated ? " (truncated — narrow your search)" : ""}`
            )
          );
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── create ───────────────────────────────────────────────────────────────
  const create = ws
    .command("create")
    .description("Create a new workspace — the slug is derived from the name and is permanent")
    .argument("<name>", "Workspace name (the slug is derived from it)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace create "Support Docs"
  $ nexus workspace create "Support Docs" --json

Notes:
  THE SLUG IS DERIVED AND THEN IMMUTABLE. "Support Docs" becomes support-docs,
  and "workspace rename" changes the NAME ONLY — the slug you get here is the
  one every mount, search and grant will use for the life of the workspace.
  Read it from the output; do not assume the slugification rule.
  A NAME WITH NO ALPHANUMERICS IS REFUSED — it would slugify to nothing.
  SLUGS ARE UNIQUE PER ORGANIZATION, so a second "Support Docs" is a conflict,
  not a second workspace. Note that an ADMIN-SHARED workspace may already carry
  the slug you want; that does not block creation, and you then have two rows
  with one slug — see "nexus workspace list" -> KIND.
  Creates a DRIVE workspace. CODE workspaces are read-only projections of a
  git project and are not creatable here.
  Needs workspaces:write.`
    )
    .action(async (name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.create({ name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printSuccess(`Created workspace "${workspace.name}"`, { slug: workspace.slug });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── rename ───────────────────────────────────────────────────────────────
  const rename = ws
    .command("rename")
    .description("Rename a workspace — the DISPLAY NAME only, the slug never changes")
    .argument("<slug>", "Workspace slug")
    .argument("<name>", "New name")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace rename support-docs "Customer Support Docs"

Notes:
  THE SLUG IS IMMUTABLE AND THIS DOES NOT TOUCH IT. Only the display name
  changes, so mounts, grants, search and ~/nexus/<slug> all keep working — and
  the slug can end up saying nothing about the name. There is no way to change
  a slug: create a new workspace and move the files.
  Existing mounts are unaffected and need no remount.
  A slug that is not yours, or is narrowed away from you, answers 404.
  Needs workspaces:write.`
    )
    .action(async (slug: string, name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.rename(slug, { name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printRecord(workspace);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ───────────────────────────────────────────────────────────────
  const remove = ws
    .command("delete")
    .description("Delete a workspace and PURGE every file in it — not a soft delete")
    .argument("<slug>", "Workspace slug")
    .option("--yes", "Skip confirmation")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace delete scratch
  $ nexus workspace delete scratch --yes

Notes:
  IT PURGES THE FILES, NOT JUST THE ROW. Every object is deleted from storage
  first and the workspace record second, so this is NOT the 72h soft delete
  that "workspace restore" recovers from — "workspace restore" cannot bring a
  deleted WORKSPACE back, only files deleted from a live one.
  ANYTHING MOUNTED KEEPS ITS MOUNT POINT AND STOPS WORKING. The local directory
  and the registry entry survive as a dead mount; run
  "nexus workspace unmount <slug>" yourself afterwards.
  ROLE GRANTS AND AGENT LINKS TO IT GO SILENTLY, AND YOU CANNOT LIST THEM
  FIRST. "nexus role workspace-grants" is indexed by ROLE — its signature is
  workspace-grants <role> — so answering "which Roles reach this workspace"
  means running it once per Role and filtering. There is no workspace-indexed
  read. Either do that sweep, or accept that grants are lost unrecorded.
  A CODE WORKSPACE USUALLY BACKS A VIBE APP. Rows whose storage type is CODE
  (the "kind" key in --json) are projections of a git project, and share a name
  with the app and the project. Check "nexus vibe app list" for a matching name
  before deleting one.
  A PARTIAL FAILURE LEAVES THE WORKSPACE PRESENT. If the storage purge fails
  the record is kept on purpose so a retry can finish; re-run the same command.
  --yes is REQUIRED when stdin is not a TTY: without it a script exits 1
  rather than deleting. This is the opposite of "folder delete" and
  "version delete", which delete unprompted in a script.
  Needs workspaces:delete, which workspaces:write does not imply.`
    )
    .action(async (slug: string, opts: { yes?: boolean }) => {
      try {
        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            console.error("Error: use --yes to confirm deletion in non-interactive mode");
            process.exitCode = 1;
            return;
          }
          const readline = await import("node:readline/promises");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const answer = await rl.question(`Delete workspace "${slug}" and all its files? [y/N] `);
          rl.close();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }
        const client = createClient(program.optsWithGlobals());
        await client.workspaces.delete(slug);
        printSuccess(`Deleted workspace "${slug}".`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── restore ──────────────────────────────────────────────────────────────
  const restore = ws
    .command("restore")
    .description("Restore a deleted file or folder from backup (within the recovery window)")
    .argument("<slug>", "Workspace slug")
    .argument("<path>", "The deleted file or folder path (relative to the workspace root)")
    .addHelpText(
      "after",
      `
Recovers a file or folder that was deleted from a workspace, using the S3
backup (version history, retained ~30 days — past the 72h soft-delete window).
Pass the path that was deleted; everything currently deleted at/under it is
restored. Live files are never overwritten.

Examples:
  $ nexus workspace restore support-docs reports/q3.pdf
  $ nexus workspace restore support-docs reports      # restore a whole folder

Notes:
  IT RESTORES FILES INTO A LIVE WORKSPACE. It cannot bring back a workspace
  deleted with "workspace delete" — that purges storage, so there is nothing
  left to restore from.
  "Nothing to restore" IS A SUCCESS, NOT AN ERROR, and it means one of three
  different things: the path is past the recovery window, it was never
  deleted, or it is already present. The command cannot tell them apart, and
  it exits 0. Check "nexus workspace search" or the mount before assuming the
  file is unrecoverable.
  LIVE FILES ARE NEVER OVERWRITTEN. A path that still exists is skipped, so
  this is safe to re-run and cannot be used to roll a file back to an older
  version — delete it first, then restore.
  THE PATH IS THE ONE THAT WAS DELETED, workspace-relative and with no leading
  slash. Given a folder, everything currently deleted at or under it comes
  back.
  Read the restored count and the paths it prints; --json carries both.`
    )
    .action(async (slug: string, filePath: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const result = await client.workspaces.restore(slug, { path: filePath });
        if (isJsonMode()) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.count === 0) {
          console.log(
            color.dim(
              `Nothing to restore at "${filePath}" — it isn't in the recovery window, was never deleted, or is already present.`
            )
          );
          return;
        }
        printSuccess(`Restored ${result.count} file${result.count === 1 ? "" : "s"} to "${slug}"`);
        for (const p of result.restored) {
          console.log(color.dim(`  ${p}`));
        }
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── mount ────────────────────────────────────────────────────────────────
  ws.command("mount")
    .description("Mount a workspace as a live drive so local Claude Code can use it")
    .argument("<slug>", "Workspace slug (see `nexus workspace list`)")
    .option("--at <path>", "Mount point (default: ~/nexus/<slug>)")
    .option("--read-only", "Mount read-only")
    .option(
      "--shared",
      "Mount the admin-shared workspace with this slug (not the same-slug org-owned one)"
    )
    .option(
      "--engine <engine>",
      "Mount engine: auto (default), webdav (native), or rclone (FUSE)",
      "auto"
    )
    .option("--claude-md", "Write a managed note about the mount into ./CLAUDE.md")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace mount support-docs
  $ nexus workspace mount support-docs --at ./ws --claude-md
  $ nexus workspace mount support-docs --read-only
  $ nexus workspace mount support-docs --shared      # mount the admin-shared copy
  $ nexus workspace mount support-docs --engine rclone

When a slug names BOTH an org-owned workspace and an admin-shared one, the bare
slug resolves to the org-owned copy. The mount then warns and tells you the id
it picked; pass --shared to mount the shared copy instead.

Mount points are NOT org-scoped: the default ~/nexus/<slug> is the same
directory for every org. Two orgs CAN have their own copy of a slug mounted at
the same time — the registry keeps them apart — but the second one must pick a
different mount point with --at <path>; mounting onto a directory another org
already occupies is refused.

Engines (auto picks per-OS):
  • webdav  — macOS native mount_webdav. No extra install, no macFUSE, no
              Recovery mode. The default on macOS, and macOS-ONLY: asking for
              it on Linux or Windows is refused outright.
  • rclone  — FUSE mount (better caching). Default on Linux (FUSE built-in) and
              Windows (WinFsp). On macOS it needs macFUSE (a kernel extension
              requiring a Recovery-mode approval), so it's opt-in there.

Prerequisites for the rclone engine (Linux and Windows defaults):
  Linux    sudo -v ; curl https://rclone.org/install.sh | sudo bash
           sudo apt-get install fuse3
  Windows  winget install Rclone.Rclone   (plus WinFsp: https://winfsp.dev)
  macOS    brew install rclone            (only if you pass --engine rclone;
                                           it also pulls in macFUSE)

Notes:
  THE MOUNT POINT MUST BE EMPTY, and it is created for you if it does not
  exist. A non-empty directory is refused with "Mount point <path> is not
  empty" before anything is mounted — pick another with --at.
  THE MOUNTED DRIVE IS NOT POSIX. In-place edits are unsupported: mv, sed -i
  and >> answer "Function not implemented". Read the file, transform it in
  memory, and write the whole file back.
  workspaces:read IS ENOUGH TO MOUNT AND READ. Writing needs workspaces:write
  and DELETING NEEDS workspaces:delete, which write does not imply — a
  read-write mount on a key without it fails every rm with a 403 while every
  cp succeeds. --read-only is a local guard, not the scope.
  A SUCCESSFUL MOUNT IS NOT A WORKING MOUNT. mount_webdav and rclone both
  report success on a mount whose gateway then refuses every read. Verify by
  reading one file you know is there.
  MOUNT POINTS ARE NOT ORG-SCOPED (the default ~/nexus/<slug> is the same
  directory for every org), but the registry is: two orgs can hold the same
  slug at once, and the second must pass --at <path>.
  --shared PICKS THE ADMIN-SHARED COPY. Without it a slug that names both
  resolves to the org-owned one, and the command warns and prints the id it
  chose — read that line.
  --claude-md WRITES TO ./CLAUDE.md IN THE CURRENT DIRECTORY, creating it if
  needed and replacing only its managed nexus-workspace block.
  THE MOUNT OUTLIVES THIS COMMAND. rclone is detached, so the CLI exits while
  the mount stays up; it survives until "nexus workspace unmount", a reboot, or
  the process being killed. Its log is under the CLI's log directory.
  The drive is LIVE and SHARED: teammates and agents see your changes within
  seconds, and you see theirs. Unmount with \`nexus workspace unmount <slug>\`.`
    )
    .action(
      async (
        slug: string,
        opts: {
          at?: string;
          readOnly?: boolean;
          shared?: boolean;
          engine?: string;
          claudeMd?: boolean;
        }
      ) => {
        try {
          assertMountableSlug(slug);
          const engine = resolveEngine(opts.engine);
          const { apiKey, baseUrl, scope } = resolveAuth(program.optsWithGlobals());
          const mountPath = path.resolve(opts.at || defaultMountPath(slug));

          // Guard scoped to this org only: a second org mounting the same slug
          // at a different path must succeed (NEX-2360). findMount matches the
          // active scope's own entries (incl. a pre-drift or legacy bare-slug
          // mount of this slug) but never another org's, so a still-live mount
          // blocks a duplicate while cross-org mounts stay independent. The
          // error names the owning org/profile so a real conflict is actionable.
          const mounts = readMounts();
          const existing = findMount(mounts, slug, scope);
          if (existing && isMountLive(existing.record)) {
            // A row naming no org may belong to a different organization, so
            // "unmount it first" would be an instruction to detach someone
            // else's live drive. Which unowned row this is depends on who is
            // asking, and so does the way out — advice that does not hold for
            // the caller reading it is worse than none.
            //
            //   - anonymous caller: the base-URL bucket, one entry per (base
            //     URL, slug), shared by every caller that arrives with a raw
            //     --api-key and no NEXUS_ORGANIZATION_ID. Identifying yourself
            //     genuinely is the escape — it moves you to an `org:`/`profile:`
            //     key of your own, and `scopeCandidateKeys` then stops offering
            //     you this bucket at all.
            //   - identified caller: the bucket is already unreachable, so the
            //     only unowned row left to match is a legacy bare-slug entry
            //     written before org scoping existed. Logging in cannot help —
            //     it is what put the caller here — so say what the row is and
            //     leave the judgement with the one person who can make it.
            const anonymous = !existing.record.orgId && !existing.record.profile;
            const callerIdentified = Boolean(scope.orgId || scope.profile);
            throw new Error(
              `Workspace "${slug}" is already mounted at ${existing.record.mountPath} for ` +
                `${describeOwner(existing.record)}. ` +
                (!anonymous
                  ? `Unmount it first.`
                  : callerIdentified
                    ? `That record predates org-scoped mounts and names no organization, so the ` +
                      `CLI cannot tell whether it is yours. Unmount it only if you know it is — ` +
                      `otherwise mount at a different path with --at.`
                    : `That record names no organization: mounts made with a raw ` +
                      `--api-key/NEXUS_API_KEY and no NEXUS_ORGANIZATION_ID all share one registry ` +
                      `entry per base URL + slug, so it may belong to a different org than yours. ` +
                      `Run \`nexus auth login\` or set NEXUS_ORGANIZATION_ID so the two can be told ` +
                      `apart — do not unmount it unless you know it is yours.`)
            );
          }

          // The guard above is org-scoped; the mount POINT is not. The default
          // `~/nexus/<slug>` carries no org segment, so a second org mounting
          // the same slug aims at the same directory — and its scoped lookup
          // finds nothing, so nothing above catches the clash. Two rows naming
          // one mount point corrupt each other: every OS action keys off
          // `mountPath`, so `unmount` under org A would detach org B's live
          // drive there. Check the path across ALL scopes; the stale rows this
          // reports are dropped below, as we take the path over.
          const claim = claimMountPoint(mounts, mountPath, {
            exceptKey: existing?.key,
            isLive: isMountLive
          });
          if (claim.blockedBy) {
            const other = claim.blockedBy.record;
            throw new Error(
              `Mount point ${mountPath} is already in use by ${describeOwner(other)}'s mount of ` +
                `"${other.slug}". Mount points are not org-scoped — the default ~/nexus/<slug> is ` +
                `the same directory for every org. Mount "${slug}" elsewhere with --at <path>, or ` +
                `unmount that workspace first.`
            );
          }

          // Resolve which copy of the slug we're about to mount. A slug can name
          // BOTH an org-owned workspace and an admin-shared one; the bare slug
          // resolves to the org-owned copy server-side, so without this the user
          // can silently mount the wrong drive (NEX-2362). Best-effort: a list
          // hiccup degrades to the legacy bare-slug mount rather than blocking.
          const client = createClient(program.optsWithGlobals());
          const target = await resolveMountTarget(client, slug, !!opts.shared);

          // `--shared` is an explicit request, so never proceed unverified: a
          // missing list (target === null) means we couldn't confirm the shared
          // workspace exists, and a confirmed-absent one is a hard error. Either
          // way, mounting the `_shared/<slug>` path blindly would yield a live
          // mount that 404s on every request (esp. under rclone). The default
          // (bare-slug) path still degrades gracefully when the list is missing.
          if (opts.shared) {
            if (!target) {
              throw new Error(
                `Couldn't verify workspaces for "${slug}" — fetching the workspace list failed. ` +
                  `Retry, or run \`nexus workspace list\` to confirm the admin-shared workspace exists.`
              );
            }
            if (!target.shared) {
              throw new Error(
                `No admin-shared workspace has the slug "${slug}". ` +
                  `Run \`nexus workspace list\` to see available workspaces.`
              );
            }
          }

          const useShared = !!opts.shared || (!!target?.shared && !target.orgOwned);

          // Drop a stale prior row (possibly under a legacy bare-slug or
          // pre-drift key) so we don't leave a duplicate entry for this same
          // workspace + org — legacy records migrate to a scoped key here.
          if (existing) delete mounts[existing.key];
          // Same for a dead row of ANOTHER scope that names this mount point:
          // it describes nothing live, and left in place it would come to
          // describe OUR mount — a later unmount of that row would detach a
          // drive it never mounted. Deleted only in memory here; the registry
          // file is untouched unless the mount below actually succeeds.
          for (const dead of claim.stale) {
            printWarning(
              `Reclaiming ${mountPath} from a stale mount record ` +
                `(${describeOwner(dead.record)}, workspace "${dead.record.slug}").`,
              "That mount is no longer live, so its registry entry is being replaced."
            );
            delete mounts[dead.key];
          }
          ensureEmptyMountDir(mountPath);

          const davPath = useShared ? `_shared/${slug}` : slug;
          const url = `${baseUrl}/api/dav/${davPath}`;
          const record =
            engine === "webdav"
              ? await mountWebdav(slug, davPath, baseUrl, apiKey, mountPath, !!opts.readOnly)
              : await mountRclone(slug, url, baseUrl, apiKey, mountPath, !!opts.readOnly);

          // Org-scope the registry (NEX-2360): key by `<kind>:<acting-org>|<slug>`
          // and stamp the org/profile pinned at mount time, plus the ro/rw mode
          // (NEX-2372) and the org-owned-vs-admin-shared disambiguation
          // (NEX-2362), so `unmount`/`status` can tell which drive this is.
          mounts[mountKey(scope, slug)] = {
            ...record,
            shared: useShared,
            readOnly: !!opts.readOnly,
            ...(scope.orgId ? { orgId: scope.orgId } : {}),
            ...(scope.orgName ? { orgName: scope.orgName } : {}),
            ...(scope.profile ? { profile: scope.profile } : {}),
            ...(target?.workspaceId ? { workspaceId: target.workspaceId } : {})
          };
          writeMounts(mounts);

          let claudeMdTarget: string | null = null;
          if (opts.claudeMd) {
            claudeMdTarget = writeClaudeMdNote(slug, mountPath, !!opts.readOnly);
          }

          const kind = useShared ? "admin-shared" : "org-owned";
          // Ambiguous = both copies exist. Warn whenever we resolved one while
          // the other was reachable, so the user can tell which drive they got.
          const ambiguous = !!target?.shared && !!target?.orgOwned;

          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  mounted: true,
                  slug,
                  engine,
                  mountPath,
                  kind,
                  shared: useShared,
                  workspaceId: target?.workspaceId ?? null,
                  ambiguous,
                  pid: record.pid ?? null,
                  readOnly: !!opts.readOnly,
                  orgId: scope.orgId ?? null,
                  orgName: scope.orgName ?? null,
                  profile: scope.profile ?? null,
                  claudeMd: claudeMdTarget
                },
                null,
                2
              )
            );
            return;
          }
          printSuccess(`Mounted "${slug}" at ${mountPath}`, {
            engine,
            kind,
            mode: opts.readOnly ? "read-only" : "read-write",
            ...(scope.orgName || scope.orgId ? { org: scope.orgName ?? scope.orgId } : {}),
            ...(scope.profile ? { profile: scope.profile } : {})
          });
          if (ambiguous) {
            const idNote = target?.workspaceId ? ` (id ${target.workspaceId})` : "";
            const counterpart = useShared
              ? `drop --shared to mount the org-owned copy`
              : `pass --shared to mount the admin-shared copy instead`;
            console.log(
              color.yellow(
                `  Note: "${slug}" exists as BOTH an org-owned and an admin-shared workspace. ` +
                  `Mounted the ${kind} one${idNote}; ${counterpart}.`
              )
            );
          }
          if (claudeMdTarget) {
            console.log(color.dim(`  Wrote workspace note to ${claudeMdTarget}`));
          }
          console.log(
            color.dim(
              `  Live shared drive — teammates and agents share these files. Unmount: nexus workspace unmount ${slug}`
            )
          );
        } catch (err) {
          process.exitCode = handleError(err);
        }
      }
    );

  // ── unmount ──────────────────────────────────────────────────────────────
  ws.command("unmount")
    .alias("umount")
    .description("Unmount a previously mounted workspace")
    .argument("<slug>", "Workspace slug")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace unmount support-docs
  $ nexus workspace umount support-docs      # same command

Notes:
  IT NEEDS NO AUTH AND MAKES NO API CALL. This is a local operation on the
  mount registry, so it works with no profile configured and after a key has
  been revoked.
  IT RESOLVES BY ACTING ORG FIRST. The same slug can be mounted for several
  organizations; when the active org owns none of them the error LISTS the
  candidates and tells you to switch profile or pass --profile, instead of
  saying the mount does not exist.
  UNSAVED WORK IN FLIGHT IS NOT FLUSHED FOR YOU. Writes propagate within
  seconds — let a large copy finish before unmounting.
  THE MOUNT-POINT DIRECTORY SURVIVES, EMPTY, AND YOU MUST REMOVE IT YOURSELF.
  Since "workspace mount" refuses a mount point that is not empty, the leftover
  directory is usually fine — but it is what bites you when something later
  writes into it while unmounted. Run "rmdir" on the path you passed to --at.
  A mount point with no record answers "No mount recorded for <slug>". If the
  OS still has it mounted, unmount it with the platform tool (umount /
  fusermount -u) — this command only knows what it recorded.
  Verify with "nexus workspace status": the row is gone.`
    )
    .action((slug: string) => {
      try {
        const mounts = readMounts();
        // Scope to the acting org so the right per-org mount is targeted when
        // the same slug is mounted for multiple orgs (NEX-2360). Best-effort:
        // works with no configured profile, falling back to an UNOWNED slug
        // match only — an owned row is never detached on an unresolved scope.
        const scope = resolveScopeBestEffort(program.optsWithGlobals());
        const found = findMount(mounts, slug, scope);
        if (!found) {
          // Never say "No mount recorded" when the slug IS mounted — just for a
          // different (or ambiguous) org. `unmountMissMessage` owns which remedy
          // fits, because which one is TRUE depends on whether the candidates
          // have an owner to switch to at all.
          const candidates = findMountsBySlug(mounts, slug);
          if (candidates.length > 0) {
            throw new Error(unmountMissMessage(slug, candidates, scope));
          }
          throw new Error(`No mount recorded for "${slug}". See \`nexus workspace status\`.`);
        }
        const { key, record } = found;

        // OS-level unmount detaches both native WebDAV and rclone-FUSE cleanly.
        unmountPath(record.mountPath);
        // rclone leaves a detached process; reap it if the unmount didn't.
        if (record.engine === "rclone" && typeof record.pid === "number" && isAlive(record.pid)) {
          try {
            process.kill(record.pid);
          } catch {
            /* already gone */
          }
        }
        delete mounts[key];
        writeMounts(mounts);

        if (isJsonMode()) {
          console.log(JSON.stringify({ unmounted: true, slug }, null, 2));
          return;
        }
        printSuccess(`Unmounted "${slug}" (${record.mountPath})`);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── status ─────────────────────────────────────────────────────────────────
  ws.command("status")
    .description("Show locally recorded mounts — a local read, never a server check")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace status
  $ nexus workspace status --json

Notes:
  LIVE REFLECTS THE MOUNT ONLY, NEVER THE SERVER. It is a PID check for rclone
  and a mount-table check for the native engine, so a row can read Live yes and
  still fail every read when the WebDAV gateway refuses, the key was revoked or
  the workspace was deleted. CONFIRM BY READING ONE KNOWN FILE.
  IT SHOWS EVERY ORG'S MOUNTS, not just the active one, and needs no auth — it
  reads the local registry.
  "?" IS "NOT RECORDED", NOT "NONE". Org prints "?" when the mount was made
  with a raw --api-key and no NEXUS_ORGANIZATION_ID, and Mode prints "?" on a
  mount recorded before the mode was tracked — that mount may be read-write.
  Profile prints "-" in the same situation, not "?".
  Under --json the same fields are null rather than "?" / "-", so a script can
  tell "unknown" from a literal value.
  Mode is what the mount was CREATED with. It does not re-derive the scopes the
  key actually holds, so Mode rw on a key without workspaces:write is possible.
  "No workspaces mounted." means the registry is empty. It does not mean the OS
  has nothing mounted.`
    )
    .action(() => {
      try {
        const mounts = readMounts();
        const records = Object.values(mounts).map((m) => ({
          slug: m.slug,
          engine: m.engine,
          kind: m.shared ? "shared" : "org",
          // Mode is observable BEFORE writing now (NEX-2372). Legacy records
          // predate the field, so surface "unknown" rather than guessing rw.
          mode: m.readOnly === undefined ? null : m.readOnly ? "ro" : "rw",
          // Acting org + profile pinned at mount time (NEX-2360/NEX-2372).
          // Null on legacy records and unknown-org (--api-key) mounts.
          orgId: m.orgId ?? null,
          orgName: m.orgName ?? null,
          profile: m.profile ?? null,
          mountPath: m.mountPath,
          live: isMountLive(m) ? "yes" : "no",
          mountedAt: m.mountedAt
        }));
        if (isJsonMode()) {
          console.log(JSON.stringify(records, null, 2));
          return;
        }
        if (records.length === 0) {
          console.log(color.dim("No workspaces mounted."));
          return;
        }
        // `records` keeps the nullable raw fields for `--json`; the table needs
        // rendered placeholders. No cast: `printTable` checks column keys
        // against the row type now, and the cast would take this call site back
        // out of that check.
        const rows = records.map((r) => ({
          ...r,
          org: r.orgName ?? r.orgId ?? "?",
          profile: r.profile ?? "-",
          mode: r.mode ?? "?"
        }));
        printTable(rows, [
          { key: "slug", label: "Slug" },
          { key: "org", label: "Org" },
          { key: "profile", label: "Profile" },
          { key: "mode", label: "Mode" },
          { key: "engine", label: "Engine" },
          { key: "kind", label: "Kind" },
          { key: "mountPath", label: "Mount point" },
          { key: "live", label: "Live" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists — see `bindCommand`. Only the six
  // Public API v1 subcommands are bound; mount / unmount / status speak to this
  // machine's own registry and call no v1 route at all.
  bindCommand(list, WORKSPACE_LIST_CONTRACT);
  bindCommand(search, WORKSPACE_SEARCH_CONTRACT);
  bindCommand(create, WORKSPACE_CREATE_CONTRACT);
  bindCommand(rename, WORKSPACE_RENAME_CONTRACT);
  bindCommand(remove, WORKSPACE_DELETE_CONTRACT);
  bindCommand(restore, WORKSPACE_RESTORE_CONTRACT);
}

/** OS-native unmount of a mount point. Best-effort across platforms/engines. */
function unmountPath(mountPath: string): void {
  const candidates: [string, string[]][] =
    process.platform === "darwin"
      ? [
          ["umount", [mountPath]],
          ["diskutil", ["unmount", mountPath]]
        ]
      : process.platform === "win32"
        ? [] // rclone mount on Windows stops when the process is killed
        : [
            ["fusermount", ["-u", mountPath]],
            ["umount", [mountPath]]
          ];
  for (const [cmd, args] of candidates) {
    try {
      execFileSync(cmd, args, { stdio: "ignore" });
      return;
    } catch {
      /* try the next candidate */
    }
  }
}

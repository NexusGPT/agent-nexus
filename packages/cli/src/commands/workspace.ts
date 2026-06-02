import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { Command } from "commander";

import { createClient } from "../client";
import { resolveBaseUrl, resolveProfile } from "../config";
import { handleError } from "../errors";
import { color, isJsonMode, printRecord, printSuccess, printTable } from "../output";

// ── Mount engines ─────────────────────────────────────────────────────────────
//
// The macFUSE-via-Recovery-mode requirement is macOS-specific to rclone's FUSE
// mount. So the default avoids FUSE entirely:
//   - macOS  → native WebDAV (`mount_webdav`) — built in, no kext, no Recovery.
//   - Linux  → rclone (FUSE is in-kernel; no extra driver, no root).
//   - Windows→ rclone (WinFsp — a normal installer, no Recovery mode).
// `--engine rclone|webdav` overrides the per-OS default.

type Engine = "webdav" | "rclone";

function resolveEngine(requested: string | undefined): Engine {
  if (requested === "webdav" || requested === "rclone") return requested;
  if (requested && requested !== "auto") {
    throw new Error(`Unknown --engine "${requested}". Use "auto", "webdav", or "rclone".`);
  }
  // auto: native WebDAV on macOS (no macFUSE), rclone elsewhere.
  return process.platform === "darwin" ? "webdav" : "rclone";
}

// ── Mount state (so `unmount`/`status` can find the mount again) ──────────────

interface MountRecord {
  slug: string;
  engine: Engine;
  mountPath: string;
  baseUrl: string;
  /** Present only for the rclone engine; native WebDAV has no tracked process. */
  pid?: number;
  mountedAt: string;
}

const STATE_DIR = path.join(os.homedir(), ".nexus-mcp");
const STATE_FILE = path.join(STATE_DIR, "workspace-mounts.json");
const LOG_DIR = path.join(STATE_DIR, "logs");

function readMounts(): Record<string, MountRecord> {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Record<string, MountRecord>;
  } catch {
    return {};
  }
}

function writeMounts(mounts: Record<string, MountRecord>): void {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(mounts, null, 2) + "\n");
}

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

/** Resolve the API key + base URL from the same chain the SDK client uses. */
function resolveAuth(opts: { apiKey?: string; baseUrl?: string; profile?: string }): {
  apiKey: string;
  baseUrl: string;
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
  return { apiKey, baseUrl };
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
  const url = `${baseUrl}/api/dav/_t/${encodeURIComponent(token)}/${slug}`;

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

  // ── list ─────────────────────────────────────────────────────────────────
  ws.command("list")
    .description("List the workspaces in your organization")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace list
  $ nexus workspace list --json`
    )
    .action(async () => {
      try {
        const client = createClient(program.optsWithGlobals());
        const { workspaces } = await client.workspaces.list();
        if (isJsonMode()) {
          console.log(JSON.stringify(workspaces, null, 2));
          return;
        }
        printTable(
          workspaces.map((w) => ({
            slug: w.slug,
            name: w.name,
            files: w.stats.fileCount,
            size: formatBytes(w.stats.totalBytes)
          })) as unknown as Record<string, unknown>[],
          [
            { key: "slug", label: "Slug" },
            { key: "name", label: "Name" },
            { key: "files", label: "Files" },
            { key: "size", label: "Size" }
          ]
        );
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── create ───────────────────────────────────────────────────────────────
  ws.command("create")
    .description("Create a new workspace")
    .argument("<name>", "Workspace name (the slug is derived from it)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus workspace create "Support Docs"`
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
  ws.command("rename")
    .description("Rename a workspace (the slug stays the same)")
    .argument("<slug>", "Workspace slug")
    .argument("<name>", "New name")
    .action(async (slug: string, name: string) => {
      try {
        const client = createClient(program.optsWithGlobals());
        const workspace = await client.workspaces.rename(slug, { name });
        if (isJsonMode()) {
          console.log(JSON.stringify(workspace, null, 2));
          return;
        }
        printRecord(workspace as unknown as Record<string, unknown>);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // ── delete ───────────────────────────────────────────────────────────────
  ws.command("delete")
    .description("Delete a workspace and purge all of its files")
    .argument("<slug>", "Workspace slug")
    .option("--yes", "Skip confirmation")
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

  // ── mount ────────────────────────────────────────────────────────────────
  ws.command("mount")
    .description("Mount a workspace as a live drive so local Claude Code can use it")
    .argument("<slug>", "Workspace slug (see `nexus workspace list`)")
    .option("--at <path>", "Mount point (default: ~/nexus/<slug>)")
    .option("--read-only", "Mount read-only")
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
  $ nexus workspace mount support-docs --engine rclone

Engines (auto picks per-OS):
  • webdav  — macOS native mount_webdav. No extra install, no macFUSE, no
              Recovery mode. The default on macOS.
  • rclone  — FUSE mount (better caching). Default on Linux (FUSE built-in) and
              Windows (WinFsp). On macOS it needs macFUSE (a kernel extension
              requiring a Recovery-mode approval), so it's opt-in there.

The drive is LIVE and SHARED: teammates and agents see your changes within
seconds, and you see theirs. Unmount with \`nexus workspace unmount <slug>\`.`
    )
    .action(
      async (
        slug: string,
        opts: { at?: string; readOnly?: boolean; engine?: string; claudeMd?: boolean }
      ) => {
        try {
          assertMountableSlug(slug);
          const engine = resolveEngine(opts.engine);
          const { apiKey, baseUrl } = resolveAuth(program.optsWithGlobals());
          const mountPath = path.resolve(opts.at || defaultMountPath(slug));

          const mounts = readMounts();
          const existing = mounts[slug];
          if (existing && isMountLive(existing)) {
            throw new Error(
              `Workspace "${slug}" is already mounted at ${existing.mountPath}. Unmount it first.`
            );
          }
          ensureEmptyMountDir(mountPath);

          const url = `${baseUrl}/api/dav/${slug}`;
          const record =
            engine === "webdav"
              ? await mountWebdav(slug, baseUrl, apiKey, mountPath, !!opts.readOnly)
              : await mountRclone(slug, url, baseUrl, apiKey, mountPath, !!opts.readOnly);

          mounts[slug] = record;
          writeMounts(mounts);

          let claudeMdTarget: string | null = null;
          if (opts.claudeMd) {
            claudeMdTarget = writeClaudeMdNote(slug, mountPath, !!opts.readOnly);
          }

          if (isJsonMode()) {
            console.log(
              JSON.stringify(
                {
                  mounted: true,
                  slug,
                  engine,
                  mountPath,
                  pid: record.pid ?? null,
                  readOnly: !!opts.readOnly,
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
            mode: opts.readOnly ? "read-only" : "read-write"
          });
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
    .action((slug: string) => {
      try {
        const mounts = readMounts();
        const record = mounts[slug];
        if (!record) {
          throw new Error(`No mount recorded for "${slug}". See \`nexus workspace status\`.`);
        }

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
        delete mounts[slug];
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
    .description("Show currently mounted workspaces")
    .action(() => {
      try {
        const mounts = readMounts();
        const rows = Object.values(mounts).map((m) => ({
          slug: m.slug,
          engine: m.engine,
          mountPath: m.mountPath,
          live: isMountLive(m) ? "yes" : "no",
          mountedAt: m.mountedAt
        }));
        if (isJsonMode()) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }
        if (rows.length === 0) {
          console.log(color.dim("No workspaces mounted."));
          return;
        }
        printTable(rows as unknown as Record<string, unknown>[], [
          { key: "slug", label: "Slug" },
          { key: "engine", label: "Engine" },
          { key: "mountPath", label: "Mount point" },
          { key: "live", label: "Live" }
        ]);
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });
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

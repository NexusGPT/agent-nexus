/**
 * NEX-1879 regression test (tsx-runnable, no test framework in this package).
 *
 * Proves all three defects are fixed:
 *   1. logout wording explicitly says the profile was DELETED.
 *   2. `login --api-key ... --profile ...` is non-interactive (no prompt, no browser).
 *   3. interactive `login` with PIPED stdin ("key\nprofile\n") persists a profile.
 *
 * Isolates state by pointing HOME at a temp dir (config lives at $HOME/.nexus-mcp)
 * and stubs the validation/me endpoints with a local http server via NEXUS_BASE_URL.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "src", "index.ts");
const KEY = "nxs_testkey_1879";

let failures = 0;
function check(name: string, cond: boolean, extra = ""): void {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${extra ? "\n      " + extra : ""}`);
  }
}

// ── Local stub for the Nexus public API ────────────────────────────────────
const server = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url?.startsWith("/api/public/v1/me")) {
    res.end(JSON.stringify({ success: true, data: { orgId: "org_test", orgName: "Acme Test" } }));
    return;
  }
  // /agents validation endpoint and anything else
  res.end(JSON.stringify({ success: true, data: [] }));
});

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (typeof addr !== "object" || !addr) throw new Error("no server address");
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const home = mkdtempSync(path.join(tmpdir(), "nex1879-"));
  const configPath = path.join(home, ".nexus-mcp", "config.json");
  const env = { ...process.env, HOME: home, NEXUS_BASE_URL: baseUrl, NO_COLOR: "1" };

  function runCli(
    args: string[],
    input?: string
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    // async spawn (not spawnSync) so the parent event loop keeps serving the
    // stub HTTP server while the child's fetch validation runs.
    return new Promise((resolve) => {
      const child = spawn("npx", ["tsx", CLI, ...args], { env });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => resolve({ stdout, stderr, code: code ?? -1 }));
      child.stdin.end(input ?? "");
    });
  }

  function listProfiles(): Record<string, unknown> {
    if (!existsSync(configPath)) return {};
    return JSON.parse(readFileSync(configPath, "utf-8")).profiles ?? {};
  }

  try {
    // ── Defect 2: non-interactive --api-key + --profile ──────────────────────
    console.log("\nDefect 2 — login --api-key --profile (non-interactive):");
    {
      const r = await runCli(["auth", "login", "--api-key", KEY, "--profile", "flagprof"]);
      check("exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
      check(
        "did not open browser / prompt for key",
        !/Paste your API key/.test(r.stdout + r.stderr)
      );
      check("profile 'flagprof' persisted", "flagprof" in listProfiles());
    }

    // ── Defect 3: piped interactive login persists ───────────────────────────
    console.log("\nDefect 3 — piped interactive login persists:");
    {
      const r = await runCli(["auth", "login"], `${KEY}\npipedprof\n`);
      check("exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
      check("printed Validating...", /Validating/.test(r.stdout));
      const profiles = listProfiles();
      check(
        "profile 'pipedprof' persisted",
        "pipedprof" in profiles,
        `profiles=${JSON.stringify(Object.keys(profiles))}`
      );
    }

    // verify `auth list` actually shows them
    {
      const r = await runCli(["auth", "list"]);
      check("auth list shows flagprof", /flagprof/.test(r.stdout));
      check("auth list shows pipedprof", /pipedprof/.test(r.stdout));
    }

    // ── Defect 1: logout wording is unambiguous (deletion) ───────────────────
    console.log("\nDefect 1 — logout wording says deleted:");
    {
      const r = await runCli(["auth", "logout", "flagprof"]);
      check("exit 0", r.code === 0, `code=${r.code} stderr=${r.stderr}`);
      check("says 'Deleted'", /Deleted profile/.test(r.stdout), r.stdout.trim());
      check("does NOT say ambiguous 'Removed profile'", !/Removed profile/.test(r.stdout));
      check("flagprof gone from config", !("flagprof" in listProfiles()));
    }
    {
      const r = await runCli(["auth", "logout", "pipedprof"]);
      check(
        "last-profile logout says Deleted + no profiles remaining",
        /Deleted profile/.test(r.stdout) && /No profiles remaining/.test(r.stdout),
        r.stdout.trim()
      );
    }
  } finally {
    server.close();
    rmSync(home, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
});

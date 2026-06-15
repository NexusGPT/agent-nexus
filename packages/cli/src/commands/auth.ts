import { exec } from "node:child_process";
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

import { Command } from "commander";

import {
  clearConfig,
  getProfile,
  listProfiles,
  removeNexusRc,
  removeProfile,
  resolveBaseUrl,
  resolveProfile,
  saveProfile,
  setActiveProfile,
  slugifyProfileName,
  validateProfileName,
  writeNexusRc
} from "../config";
import { color, printSuccess, printTable } from "../output";

const SETTINGS_URL = "https://app.nexusgpt.io/app/settings/api-keys";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Manage authentication and profiles");

  // ── login ─────────────────────────────────────────────────────────────
  auth
    .command("login")
    .description("Authenticate with the Nexus API and create a profile")
    .option("--api-key <key>", "API key (skip interactive prompt)")
    .option("--profile <name>", "Profile name to save as")
    .option("--env <env>", "Environment: dev or production", "production")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth login
  $ nexus auth login --api-key nxs_abc123
  $ nexus auth login --profile work --api-key nxs_abc123
  $ nexus auth login --env dev

Notes:
  API keys start with "nxs_". Get yours at https://app.nexusgpt.io/app/settings/api-keys
  Use --profile to name the saved profile (default: org name or "default").
  Run "nexus auth list" to see all profiles, "nexus auth switch <name>" to change active.`
    )
    .action(async (opts, command) => {
      // Commander 13 routes `--api-key` / `--profile` to the program-level
      // global flag slot when both global (index.ts) and subcommand-local
      // (above) options share a name — the local `opts` ends up empty even
      // though the value was on argv. `optsWithGlobals()` merges both so we
      // see the user's value regardless of which definition commander chose.
      // Without this, `nexus auth login --api-key nxs_X --profile foo`
      // silently falls into interactive mode because opts.apiKey is undef.
      const merged = command.optsWithGlobals() as {
        apiKey?: string;
        profile?: string;
        env?: string;
      };
      const effective = { ...opts, ...merged };

      let baseUrl: string | undefined;
      let dashboardUrl: string | undefined;
      if (effective.env === "dev") {
        baseUrl = "http://localhost:3001";
        dashboardUrl = "http://localhost:3000";
      }
      const resolvedBaseUrl = baseUrl ?? resolveBaseUrl();

      // A single readline interface is shared across every prompt below, with
      // a line queue so input survives the async gaps between prompts.
      //
      // The old code opened a fresh `createInterface` per prompt and `close()`d
      // it immediately. On piped stdin the first close() left the stream at EOF,
      // so the second prompt's question() never resolved and the process exited
      // 0 without ever calling saveProfile(). Even a single shared interface is
      // not enough on its own: while we `await` the validation fetch between the
      // key prompt and the profile-name prompt, readline keeps draining the pipe
      // and emits/closes before the next question() attaches — losing the line
      // (and throwing "readline was closed"). Buffering every `line` event into
      // a queue lets a later ask() pick up a line that already arrived. If the
      // input ends before a prompt is answered we reject loudly instead of
      // silently exiting. (NEX-1879 defect 3)
      let rl: readline.Interface | undefined;
      const lineQueue: string[] = [];
      const waiters: Array<(line: string | null) => void> = [];
      let inputClosed = false;
      const ask = (question: string): Promise<string> => {
        if (!rl) {
          rl = readline.createInterface({ input: stdin, output: stdout });
          rl.on("line", (line) => {
            const waiter = waiters.shift();
            if (waiter) waiter(line);
            else lineQueue.push(line);
          });
          rl.on("close", () => {
            inputClosed = true;
            while (waiters.length) (waiters.shift() as (l: string | null) => void)(null);
          });
        }
        stdout.write(question);
        const buffered = lineQueue.shift();
        if (buffered !== undefined) return Promise.resolve(buffered);
        if (inputClosed) {
          return Promise.reject(new Error("Input ended before all prompts were answered."));
        }
        return new Promise<string>((resolve, reject) => {
          waiters.push((line) => {
            if (line === null) reject(new Error("Input ended before all prompts were answered."));
            else resolve(line);
          });
        });
      };

      try {
        await runLogin();
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
      } finally {
        rl?.close();
      }

      async function runLogin(): Promise<void> {
        // ── Step 1: Get API key ──────────────────────────────────────────
        let apiKey = effective.apiKey as string | undefined;

        if (!apiKey) {
          console.log(`Opening ${color.cyan(SETTINGS_URL)} ...`);
          console.log("Create or copy an API key from the settings page.\n");
          openUrl(SETTINGS_URL);

          apiKey = (await ask("Paste your API key (nxs_...): ")).trim();
        }

        if (!apiKey) {
          console.error(color.red("Error:") + " No key entered. Aborting.");
          process.exitCode = 1;
          return;
        }

        if (!apiKey.startsWith("nxs_")) {
          console.error(
            color.red("Error:") +
              ' Invalid key format — API keys start with "nxs_".\n' +
              "  nexus auth login --api-key nxs_YOUR_KEY"
          );
          process.exitCode = 1;
          return;
        }

        // ── Step 2: Validate the key ─────────────────────────────────────
        console.log("Validating...");
        const validateRes = await fetch(`${resolvedBaseUrl}/api/public/v1/agents?limit=1`, {
          headers: { "api-key": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000)
        });

        if (!validateRes.ok) {
          console.error(
            color.red("Error:") +
              ` Validation failed (HTTP ${validateRes.status}). Check your key and try again.`
          );
          process.exitCode = 1;
          return;
        }

        // ── Step 3: Fetch org info ───────────────────────────────────────
        let orgName: string | undefined;
        let orgId: string | undefined;

        try {
          const meRes = await fetch(`${resolvedBaseUrl}/api/public/v1/me`, {
            headers: { "api-key": apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(30_000)
          });
          if (meRes.ok) {
            const meJson = (await meRes.json()) as {
              success?: boolean;
              data?: { orgId?: string; orgName?: string };
            };
            if (meJson.data) {
              orgName = meJson.data.orgName;
              orgId = meJson.data.orgId;
            }
          }
        } catch {
          // /me endpoint may not exist yet — continue without org info
        }

        if (orgName) {
          console.log(`Organization: ${color.cyan(orgName)}`);
        }

        // ── Step 4: Determine profile name ───────────────────────────────
        let profileName = effective.profile as string | undefined;

        if (!profileName) {
          const suggested = orgName ? slugifyProfileName(orgName) : "default";
          const answer = (await ask(`Profile name [${suggested}]: `)).trim();
          profileName = answer || suggested;
        }

        // Validate profile name
        const nameError = validateProfileName(profileName);
        if (nameError) {
          console.error(color.red("Error:") + " " + nameError);
          process.exitCode = 1;
          return;
        }

        // ── Step 5: Check for existing profile ───────────────────────────
        const existing = getProfile(profileName);
        if (existing) {
          const existingLabel = existing.orgName ? ` (${existing.orgName})` : "";
          const answer = (
            await ask(`Profile "${profileName}"${existingLabel} already exists. Overwrite? [y/N]: `)
          ).trim();
          if (answer.toLowerCase() !== "y") {
            console.log("Aborted.");
            return;
          }
        }

        // ── Step 6: Save the profile ─────────────────────────────────────
        saveProfile(profileName, {
          apiKey,
          ...(baseUrl ? { baseUrl } : {}),
          ...(dashboardUrl ? { dashboardUrl } : {}),
          ...(orgName ? { orgName } : {}),
          ...(orgId ? { orgId } : {})
        });

        printSuccess(`Saved profile "${profileName}".`, {
          ...(orgName ? { organization: orgName } : {}),
          profile: profileName,
          config: "~/.nexus-mcp/config.json"
        });

        // Tip for second+ profile
        const { profiles } = listProfiles();
        if (Object.keys(profiles).length > 1) {
          console.log(
            "\n" +
              color.dim("Tip: You have multiple profiles. Consider pinning directories:") +
              "\n" +
              color.dim(`  nexus auth pin ${profileName}    (in your project directory)`)
          );
        }
      }
    });

  // ── logout ────────────────────────────────────────────────────────────
  auth
    .command("logout")
    .description("Delete a stored profile (API key + org metadata)")
    .argument("[name]", "Specific profile to delete (default: active profile)")
    .option("--all", "Delete all profiles")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth logout           # deletes active profile
  $ nexus auth logout work      # deletes "work" profile
  $ nexus auth logout --all     # deletes all profiles

Notes:
  logout fully deletes the profile entry from ~/.nexus-mcp/config.json —
  the stored API key AND its org metadata (orgName, orgId, baseUrl). This is
  a deletion, not a temporary sign-out. Run "nexus auth login" to re-create it.`
    )
    .action((name: string | undefined, opts: { all?: boolean }) => {
      if (opts.all) {
        clearConfig();
        printSuccess("Deleted all profiles. Run: nexus auth login to authenticate again.");
        return;
      }

      const { activeProfile, profiles } = listProfiles();
      const target = name ?? activeProfile;

      if (!target) {
        console.error(color.red("Error:") + " No active profile. Run: nexus auth login");
        process.exitCode = 1;
        return;
      }

      if (!removeProfile(target)) {
        console.error(color.red("Error:") + ` Profile "${target}" not found. Run: nexus auth list`);
        process.exitCode = 1;
        return;
      }

      const remaining = Object.keys(profiles).filter((p) => p !== target);

      if (remaining.length === 0) {
        printSuccess(
          `Deleted profile "${target}" (API key + org metadata removed). ` +
            `No profiles remaining. Run: nexus auth login`
        );
      } else {
        const { activeProfile: newActive } = listProfiles();
        printSuccess(`Deleted profile "${target}" (API key + org metadata removed).`, {
          remaining: remaining.join(", "),
          ...(newActive ? { active: newActive } : {})
        });
      }
    });

  // ── switch ────────────────────────────────────────────────────────────
  auth
    .command("switch")
    .description("Switch the active profile")
    .argument("<name>", "Profile name to activate")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth switch work
  $ nexus auth switch personal`
    )
    .action((name: string) => {
      try {
        setActiveProfile(name);
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
        return;
      }

      const profile = getProfile(name);
      const orgPart = profile?.orgName ? ` (${profile.orgName})` : "";
      printSuccess(`Switched to "${name}"${orgPart}.`);
    });

  // ── list ──────────────────────────────────────────────────────────────
  auth
    .command("list")
    .description("List all saved profiles")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth list`
    )
    .action(() => {
      const { profiles, activeProfile } = listProfiles();
      const names = Object.keys(profiles);

      if (names.length === 0) {
        console.log(color.dim("No profiles. Run: nexus auth login"));
        return;
      }

      const rows = names.map((name) => ({
        marker: name === activeProfile ? "▸" : " ",
        name,
        orgName: profiles[name].orgName ?? color.dim("—"),
        baseUrl: profiles[name].baseUrl ?? "https://api.nexusgpt.io"
      }));

      printTable(rows, [
        { key: "marker", label: " ", width: 2 },
        { key: "name", label: "PROFILE" },
        { key: "orgName", label: "ORGANIZATION" },
        { key: "baseUrl", label: "BASE URL" }
      ]);
    });

  // ── pin ───────────────────────────────────────────────────────────────
  auth
    .command("pin")
    .description("Pin the current directory to a profile via .nexusrc")
    .argument("<profile>", "Profile name to pin")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth pin work`
    )
    .action((profileName: string) => {
      // Validate profile exists
      const profile = getProfile(profileName);
      if (!profile) {
        const { profiles } = listProfiles();
        const available = Object.keys(profiles).join(", ");
        console.error(
          color.red("Error:") +
            ` Profile "${profileName}" not found.` +
            (available ? ` Available: ${available}` : " Run: nexus auth login")
        );
        process.exitCode = 1;
        return;
      }

      writeNexusRc(process.cwd(), profileName);

      const orgPart = profile.orgName ? ` (${profile.orgName})` : "";
      printSuccess(`Pinned this directory to "${profileName}"${orgPart}.`, {
        file: ".nexusrc"
      });
      console.log(color.dim("\n  Tip: Consider adding .nexusrc to your .gitignore"));
    });

  // ── unpin ─────────────────────────────────────────────────────────────
  auth
    .command("unpin")
    .description("Remove .nexusrc from the current directory")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth unpin`
    )
    .action(() => {
      if (!removeNexusRc(process.cwd())) {
        console.error(color.red("Error:") + " No .nexusrc found in current directory.");
        process.exitCode = 1;
        return;
      }
      printSuccess("Removed .nexusrc from current directory.");
    });

  // ── status ────────────────────────────────────────────────────────────
  auth
    .command("status")
    .description("Show resolved profile and how it was determined")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth status

Notes:
  Shows profile resolution: --profile flag > NEXUS_PROFILE env > .nexusrc > active > "default".
  Use "nexus auth pin <profile>" to pin a directory to a profile via .nexusrc.`
    )
    .action(() => {
      try {
        const resolved = resolveProfile(program.optsWithGlobals());

        const sourceExplanation: Record<string, string> = {
          flag: "--profile flag",
          env: "NEXUS_PROFILE environment variable",
          directory: `.nexusrc at ${resolved.rcPath}`,
          active: "active profile in config",
          default: 'fallback to "default" profile',
          override: "--api-key flag or NEXUS_API_KEY env"
        };

        const orgPart = resolved.profile.orgName ? ` (${resolved.profile.orgName})` : "";
        console.log(
          `Using profile ${color.cyan(`"${resolved.name}"`)}${orgPart} — ${color.dim(sourceExplanation[resolved.source])}`
        );
        console.log(
          `  ${color.dim("key:")} ${resolved.profile.apiKey.slice(0, 8)}...${resolved.profile.apiKey.slice(-4)}`
        );
        console.log(`  ${color.dim("api:")} ${resolved.profile.baseUrl ?? resolveBaseUrl()}`);
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
      }
    });

  // ── whoami ────────────────────────────────────────────────────────────
  auth
    .command("whoami")
    .description("Show current authentication status")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth whoami`
    )
    .action(async () => {
      try {
        const resolved = resolveProfile(program.optsWithGlobals());
        const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();

        const res = await fetch(`${baseUrl}/api/public/v1/agents?limit=1`, {
          headers: { "api-key": resolved.profile.apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000)
        });

        if (!res.ok) {
          console.error(
            color.red("Error:") + " API key is invalid or expired. Run: nexus auth login"
          );
          process.exitCode = 1;
          return;
        }

        printSuccess("Authenticated.", {
          profile: resolved.name,
          ...(resolved.profile.orgName ? { organization: resolved.profile.orgName } : {}),
          api: baseUrl,
          key: resolved.profile.apiKey.slice(0, 8) + "..." + resolved.profile.apiKey.slice(-4)
        });
      } catch (err) {
        console.error(color.red("Error:") + " Not logged in. Run: nexus auth login");
        process.exitCode = 1;
      }
    });
}

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

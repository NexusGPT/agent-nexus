import { exec } from "node:child_process";
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

import { Command } from "commander";

import { AUTH_PROBE_DEFAULT_TIMEOUT_MS, probeCredential, refusalForProbe } from "../auth-probe";
import { timeoutSecondsToMs } from "../client";
import {
  clearConfig,
  getProfile,
  listProfiles,
  type NexusProfile,
  removeNexusRc,
  removeProfile,
  resolveBaseUrl,
  type ResolvedProfile,
  resolveOrganization,
  resolveProfile,
  saveProfile,
  setActiveProfile,
  setProfileOrganization,
  slugifyProfileName,
  validateProfileName,
  writeNexusRc
} from "../config";
import { refuse, reportFailure } from "../errors";
import { color, isJsonMode, printRecord, printSuccess, printTable, printWarning } from "../output";

const SETTINGS_URL = "https://app.nexusgpt.io/app/settings/api-keys";

/** Prefix that marks a personal (cross-org) token. See NEX-2474. */
const PERSONAL_TOKEN_PREFIX = "nxs_p_";
/**
 * Platform-operator token (NEX-3037) — cross-org like a personal token, but its
 * reach is not limited to the user's own memberships. From the CLI's point of
 * view the two behave identically: both are org-unbound, both select the acting
 * org with the `organization-id` header, so both must be accepted everywhere a
 * personal token is.
 */
const PLATFORM_OPERATOR_TOKEN_PREFIX = "nxs_o_";

/** True for any key whose acting org comes from the header rather than the key. */
export function isCrossOrgToken(apiKey: string): boolean {
  return (
    apiKey.startsWith(PERSONAL_TOKEN_PREFIX) || apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX)
  );
}

/** Why `nexus auth use-org` cannot proceed, or `null` when it can. */
export type UseOrgRefusal = "org-scoped-key" | "env-override" | null;

/**
 * Decide whether `use-org` can run, in PRECEDENCE order. Extracted and exported
 * because the order IS the behaviour and is otherwise unreachable from a test.
 *
 * Being bound to one organization outranks the env-override complaint. An
 * org-scoped key told "use the NEXUS_ORGANIZATION_ID env var instead" would be
 * sent down a path that cannot work: the server refuses a mismatched org with
 * `ORG_SCOPED_KEY_ORG_MISMATCH` rather than quietly answering from the key's own
 * org (NEX-3175). Its real remedy — obtain a personal token — is the same with or
 * without an override, so it is reported first.
 */
export function classifyUseOrgRefusal(input: {
  apiKey: string;
  personalToken?: boolean;
  source: string;
}): UseOrgRefusal {
  const isPersonalToken = input.personalToken === true || isCrossOrgToken(input.apiKey);
  if (!isPersonalToken) {
    return "org-scoped-key";
  }
  if (input.source === "override") {
    return "env-override";
  }
  return null;
}

interface UserOrganization {
  organizationId: string;
  name: string | null;
  role: string;
}

/** Fetch the organizations a token can act on (GET /me/organizations). */
async function fetchOrganizations(baseUrl: string, apiKey: string): Promise<UserOrganization[]> {
  const res = await fetch(`${baseUrl}/api/public/v1/me/organizations`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) {
    throw new Error(`Could not list organizations (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { data?: UserOrganization[] };
  return json.data ?? [];
}

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
  Run "nexus auth list" to see all profiles, "nexus auth switch <name>" to change active.

  --env dev MEANS TWO HARDCODED LOCALHOST PORTS, AND THEY ARE STORED ON THE
  PROFILE. It points the API at http://localhost:3001 and the dashboard at
  http://localhost:3000 — the ports are fixed, not read from anything you can
  set, so a local stack listening elsewhere cannot be reached this way. Pass
  --base-url instead for any other address. Because both URLs are written onto
  the saved profile, a profile created with --env dev keeps pointing at
  localhost until you log in again.`
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
        // Every network call inside `runLogin` is caught at its own site, so
        // what reaches here is local: a readline that ended before the prompts
        // were answered, a config write, a browser spawn.
        process.exitCode = reportFailure("local-failed", (err as Error).message);
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
          process.exitCode = refuse("No key entered. Aborting.");
          return;
        }

        if (!apiKey.startsWith("nxs_")) {
          process.exitCode = refuse(
            'Invalid key format — API keys start with "nxs_".\n' +
              "  nexus auth login --api-key nxs_YOUR_KEY"
          );
          return;
        }

        // Both kinds are org-unbound and share every code path below; the flag
        // means "selects its org via the header", not "is a personal token".
        const isPersonalToken = isCrossOrgToken(apiKey);
        const isPlatformOperatorKey = apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX);

        let orgName: string | undefined;
        let orgId: string | undefined;
        let userEmail: string | undefined;

        if (isPersonalToken) {
          // ── Personal (cross-org) token: validate by listing orgs, pick one ──
          console.log(
            isPlatformOperatorKey
              ? "Validating platform-operator key..."
              : "Validating personal token..."
          );
          let organizations: UserOrganization[];
          try {
            organizations = await fetchOrganizations(resolvedBaseUrl, apiKey);
          } catch (err) {
            process.exitCode = reportFailure("connection-failed", (err as Error).message);
            return;
          }

          // A platform-operator key acts on ANY org (NEX-3037), so the membership
          // list is a convenience here, not the set of valid answers. Prompt for
          // an org id whether or not memberships exist — gating this on an EMPTY
          // list would have covered only the holder with no orgs at all, and left
          // the motivating case (an operator who does have memberships, wanting a
          // DIFFERENT org) able to pick only from their own.
          if (isPlatformOperatorKey) {
            console.log(
              `\nThis is a ${color.cyan("platform-operator key")} — it acts on any ` +
                "organization, including ones you are not a member of. Every request is " +
                "recorded in the admin audit log."
            );
            if (organizations.length > 0) {
              console.log(color.dim("Your own organizations, for convenience:"));
              organizations.forEach((org) => {
                console.log(color.dim(`  ${org.organizationId}  ${org.name ?? ""}`));
              });
            }
            const entered = (await ask("Organization id to start on (org_...): ")).trim();
            if (!entered) {
              process.exitCode = refuse(
                "A platform-operator key must name the organization it acts on."
              );
              return;
            }
            orgId = entered;
            orgName = organizations.find((o) => o.organizationId === entered)?.name ?? undefined;
          }

          // Personal tokens genuinely cannot act without a membership; the
          // platform-operator case already has its org from the block above.
          if (organizations.length === 0 && !isPlatformOperatorKey) {
            process.exitCode = reportFailure(
              "not-found",
              "This token's user does not belong to any organization."
            );
            return;
          }

          // Skipped when the platform-operator branch above already took an org
          // id by hand — `organizations` is empty there, so every index into it
          // below would be undefined.
          if (!orgId) {
            console.log(
              `\nThis is a ${color.cyan("personal token")} — one key across ${color.cyan(
                String(organizations.length)
              )} organization(s).`
            );

            let chosen: UserOrganization;
            if (organizations.length === 1) {
              chosen = organizations[0];
              console.log(
                `Active organization: ${color.cyan(chosen.name ?? chosen.organizationId)}`
              );
            } else {
              organizations.forEach((org, i) => {
                console.log(
                  `  ${color.cyan(String(i + 1))}. ${org.name ?? org.organizationId} ${color.dim(
                    `(${org.role})`
                  )}`
                );
              });
              const answer = (await ask(`Select active organization [1]: `)).trim();
              const index = answer ? Number.parseInt(answer, 10) - 1 : 0;
              if (Number.isNaN(index) || index < 0 || index >= organizations.length) {
                process.exitCode = refuse("Invalid selection.");
                return;
              }
              chosen = organizations[index];
            }
            orgId = chosen.organizationId;
            orgName = chosen.name ?? undefined;
          }

          // Resolve the owning user's email — and the org's NAME — for the chosen
          // org (best-effort).
          //
          // The name matters most in the case it was previously never filled:
          // a platform-operator key targeting a FOREIGN org has no membership row
          // to read a name from, so `auth status` and `auth orgs` would show a
          // bare `org_...` id for the one tenant this credential exists to reach.
          // This request is already being made and already carries the selected
          // org, so the name comes back for free — it was simply not being read.
          try {
            const meRes = await fetch(`${resolvedBaseUrl}/api/public/v1/me`, {
              headers: {
                "api-key": apiKey,
                "organization-id": orgId,
                Accept: "application/json"
              },
              signal: AbortSignal.timeout(30_000)
            });
            if (meRes.ok) {
              const meJson = (await meRes.json()) as {
                data?: { userEmail?: string; orgName?: string };
              };
              userEmail = meJson.data?.userEmail ?? undefined;
              // Never overwrite a name already resolved from the membership list.
              orgName = orgName ?? meJson.data?.orgName ?? undefined;
            }
          } catch {
            // best-effort
          }
        } else {
          // ── Org-scoped key: validate via a cheap authenticated probe ───────
          console.log("Validating...");
          const validateRes = await fetch(`${resolvedBaseUrl}/api/public/v1/agents?limit=1`, {
            headers: { "api-key": apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(30_000)
          });

          if (!validateRes.ok) {
            process.exitCode = reportFailure(
              "remote-error",
              `Validation failed (HTTP ${validateRes.status}). Check your key and try again.`
            );
            return;
          }

          try {
            const meRes = await fetch(`${resolvedBaseUrl}/api/public/v1/me`, {
              headers: { "api-key": apiKey, Accept: "application/json" },
              signal: AbortSignal.timeout(30_000)
            });
            if (meRes.ok) {
              const meJson = (await meRes.json()) as {
                success?: boolean;
                data?: { orgId?: string; orgName?: string; userEmail?: string };
              };
              if (meJson.data) {
                orgName = meJson.data.orgName ?? undefined;
                orgId = meJson.data.orgId ?? undefined;
                userEmail = meJson.data.userEmail ?? undefined;
              }
            }
          } catch {
            // /me may be unreachable on older backends — continue without org info
          }
        }

        if (orgName) {
          console.log(`Organization: ${color.cyan(orgName)}`);
        }
        if (userEmail) {
          console.log(`User: ${color.cyan(userEmail)}`);
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
          process.exitCode = refuse(nameError);
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
          ...(orgId ? { orgId } : {}),
          ...(userEmail ? { userEmail } : {}),
          ...(isPersonalToken ? { personalToken: true } : {})
        });

        printSuccess(`Saved profile "${profileName}".`, {
          ...(orgName ? { organization: orgName } : {}),
          ...(isPersonalToken
            ? {
                type: isPlatformOperatorKey
                  ? "platform-operator key (any org, audited)"
                  : "personal token (cross-org)"
              }
            : {}),
          profile: profileName,
          config: "~/.nexus-mcp/config.json"
        });

        if (isPersonalToken) {
          console.log(
            "\n" +
              color.dim("Tip: switch the active org without re-authenticating:") +
              "\n" +
              color.dim("  nexus auth orgs              list your organizations") +
              "\n" +
              color.dim("  nexus auth use-org <orgId>   switch the active organization")
          );
        }

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
        process.exitCode = reportFailure(
          "not-authenticated",
          "No active profile.",
          "Run: nexus auth login"
        );
        return;
      }

      if (!removeProfile(target)) {
        process.exitCode = reportFailure(
          "not-found",
          `Profile "${target}" not found.`,
          "Run: nexus auth list"
        );
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
    .description("Switch the active profile — machine-wide, or scoped to this folder or shell")
    .argument("<name>", "Profile name to activate")
    .option(
      "--here",
      "Scope the switch to THIS DIRECTORY (writes .nexusrc); the machine-wide active profile is left alone"
    )
    .option(
      "--session",
      "Scope the switch to THIS SHELL: print the export line to eval; writes nothing at all"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth switch work
  $ nexus auth switch work --here
  $ eval "$(nexus auth switch work --session)"

Notes:
  THE DEFAULT SWITCH IS MACHINE-WIDE, NOT PER-TERMINAL. It rewrites one value in
  ~/.nexus-mcp/config.json that EVERY process on this machine reads, so it also
  repoints every other shell, editor and agent session that has no binding of its
  own — including long-running ones already mid-task. Two sessions working on two
  organizations cannot both use it: the last switch wins for both, and the loser
  gets no signal, so its next write lands in the other organization (NEX-2525).
  --here and --session are the per-folder and per-shell scopes that CAN be held
  concurrently:
    --here     writes {"profile":"<name>"} to ./.nexusrc — this directory and its
               subdirectories, in every shell, until "nexus auth unpin". Same file
               as "nexus auth pin", and re-running it MOVES an existing pin.
    --session  writes NOTHING. It prints one line, "export NEXUS_PROFILE=<name>",
               for you to eval; the binding then lives in that shell's environment
               and dies with it. Not eval'd, it does nothing — the printed line is
               the whole effect. POSIX syntax; in fish use "set -gx NEXUS_PROFILE
               <name>", and --json carries the raw name for any other shell.
  SWITCHING IS NOT THE SAME AS WINNING. This changes which profile "active"
  resolves to, and three things outrank active and PERSIST across processes:
  NEXUS_API_KEY, NEXUS_PROFILE, and a .nexusrc pin in the working directory. Any
  of them still decides what the NEXT command uses.
  So this command predicts what the next process will resolve to and REFUSES to
  be silent about a mismatch: it warns and EXITS NON-ZERO, which is what stops
  "nexus auth switch org-b && nexus workspace mount" running the second half
  against the wrong organization.
  The prediction deliberately ignores --api-key and --profile given on THIS
  invocation, because those are ephemeral and do not carry into the next process.
  Clear a .nexusrc pin with "nexus auth unpin"; the two environment variables are
  yours to unset.
  Full precedence, highest first: --api-key > --profile > NEXUS_API_KEY >
  NEXUS_PROFILE (--session) > .nexusrc (--here) > active profile (plain switch) >
  the profile named "default". An explicit --profile outranks an exported
  NEXUS_API_KEY; nothing else does.`
    )
    .action((name: string, opts: { here?: boolean; session?: boolean }) => {
      // Two scopes, and the whole point of them is that they are DIFFERENT
      // places. Silently applying one would leave the other unwritten under a
      // command line that asked for it.
      if (opts.here && opts.session) {
        process.exitCode = refuse(
          "--here and --session are two different scopes; pass one.",
          "--here writes ./.nexusrc; --session prints an export line for this shell."
        );
        return;
      }

      if (opts.here) {
        switchHere(name);
        return;
      }
      if (opts.session) {
        switchSession(name);
        return;
      }

      try {
        setActiveProfile(name);
      } catch (err) {
        process.exitCode = reportFailure("local-failed", (err as Error).message);
        return;
      }

      const profile = getProfile(name);
      const orgPart = profile?.orgName ? ` (${profile.orgName})` : "";
      printSuccess(`Switched to "${name}"${orgPart}.`);

      // Say out loud that this reached every other session. The command reads as
      // "switch MY profile" and is not: with more than one profile saved there is
      // something to clobber, and the sessions it clobbers print nothing at all.
      if (!isJsonMode() && Object.keys(listProfiles().profiles).length > 1) {
        console.log(
          color.dim(
            "\n  Machine-wide: every other shell without its own binding now resolves to " +
              `"${name}" too.` +
              `\n  Scope it instead: nexus auth switch ${name} --here (this folder) · ` +
              `--session (this shell)`
          )
        );
      }

      if (switchIsShadowed(name)) process.exitCode = 1;
    });

  // ── list ──────────────────────────────────────────────────────────────
  auth
    .command("list")
    .description("List all saved profiles")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth list
  $ nexus auth list --json

Notes:
  The ▸ marker is the ACTIVE profile, which is not necessarily the credential the
  next command uses — NEXUS_API_KEY, NEXUS_PROFILE and a .nexusrc pin all outrank
  it. "nexus auth whoami" resolves the one that actually wins.
  A row shows the profile name, its organization and its base URL. A profile with
  no stored baseUrl is listed against the default, https://api.nexusgpt.io, so
  that column is never blank and never proves the value was set explicitly.
  EMPTY ANSWERS DIFFERENTLY IN THE TWO MODES. With no profiles saved, --json is
  \`[]\` and the plain form is a human sentence pointing at "nexus auth login" —
  so parse the JSON, never the prose.

  --json IS A BARE ARRAY AND THE ACTIVE PROFILE IS FLAGGED BY A GLYPH, NOT A
  BOOLEAN. There is no envelope and no meta — the rows are the whole document,
  each one {marker, name, orgName, baseUrl}. "marker" is the ▸ from the table,
  and it is a single SPACE on every other row, so test it against "▸" rather
  than for truthiness: " " is a non-empty string and every row would match.

    $ nexus auth list --json | jq -r '.[] | select(.marker == "▸") | .name'

  That reads the ACTIVE profile, which is still not necessarily the one the next
  command uses — see the first note. "nexus auth whoami" resolves that one.`
    )
    .action(() => {
      const { profiles, activeProfile } = listProfiles();
      const names = Object.keys(profiles);

      // The hint is HUMAN copy. Under --json an empty account is `[]`, which is
      // what every other list command answers and what a script can act on; the
      // sentence was unparseable prose and the only thing on stdout.
      if (names.length === 0 && !isJsonMode()) {
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
  $ nexus auth pin work

Notes:
  IT WRITES ./.nexusrc IN THE CURRENT DIRECTORY, holding {"profile":"<name>"}
  and nothing else. It names a profile; it stores no key.
  "nexus auth switch <name> --here" writes the SAME file — one behaviour, two
  spellings, so the verb that changes organization can also scope the change to
  this folder instead of the whole machine.

  ⚠️ IN A REPOSITORY THAT FILE IS COMMITTABLE, AND COMMITTING IT REPOINTS YOUR
  TEAMMATES' CLI. A colleague who has a profile of the same name silently starts
  acting against THAT organization in this directory, with no prompt and nothing
  in the output saying a pin is in effect. A colleague who does not have it gets
  an unexplained failure. Add .nexusrc to .gitignore unless the whole team
  genuinely shares the profile name.

  Run "nexus auth whoami" from the directory to see which profile is winning.`
    )
    .action((profileName: string) => {
      // Validate profile exists
      const profile = getProfile(profileName);
      if (!profile) {
        const { profiles } = listProfiles();
        const available = Object.keys(profiles).join(", ");
        process.exitCode = reportFailure(
          "not-found",
          `Profile "${profileName}" not found.`,
          available ? `Available: ${available}` : "Run: nexus auth login"
        );
        return;
      }

      writeNexusRc(process.cwd(), profileName);

      const orgPart = profile.orgName ? ` (${profile.orgName})` : "";
      printSuccess(`Pinned this directory to "${profileName}"${orgPart}.`, {
        file: ".nexusrc"
      });
      if (!isJsonMode()) {
        console.log(color.dim("\n  Tip: Consider adding .nexusrc to your .gitignore"));
      }
    });

  // ── unpin ─────────────────────────────────────────────────────────────
  auth
    .command("unpin")
    .description("Remove .nexusrc from the current directory")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth unpin

Notes:
  THE CURRENT DIRECTORY ONLY. This removes ./.nexusrc and walks nowhere — a pin
  in a parent directory is untouched and keeps applying. Run it where the pin is.
  It EXITS NON-ZERO when there is no .nexusrc here, so "no pin to remove" and
  "pin removed" are distinguishable in a script rather than both reading as
  success.
  A pin outranks the active profile, so removing it changes which credential the
  next command resolves to. "nexus auth whoami" confirms what wins afterwards.`
    )
    .action(() => {
      if (!removeNexusRc(process.cwd())) {
        process.exitCode = reportFailure("not-found", "No .nexusrc found in current directory.");
        return;
      }
      printSuccess("Removed .nexusrc from current directory.");
    });

  // ── orgs ──────────────────────────────────────────────────────────────
  auth
    .command("orgs")
    .description("List the organizations the active token can act on")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth orgs

Notes:
  For a personal (cross-org) token, lists every organization you belong to and
  marks the active one (▸). Switch with "nexus auth use-org <orgId>".`
    )
    .action(async () => {
      const globals = program.optsWithGlobals();
      let resolved;
      try {
        resolved = resolveProfile(globals);
      } catch {
        process.exitCode = reportFailure(
          "not-authenticated",
          "Not logged in.",
          "Run: nexus auth login"
        );
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      let organizations: UserOrganization[];
      try {
        organizations = await fetchOrganizations(baseUrl, resolved.profile.apiKey);
      } catch (err) {
        process.exitCode = reportFailure("connection-failed", (err as Error).message);
        return;
      }

      // A platform-operator profile can be pointed at an org OUTSIDE the owner's
      // memberships, and /me/organizations only ever returns memberships. Without
      // this the active tenant simply would not appear — no row carries the ▸ —
      // and the operator has no way to confirm from the CLI which org they are
      // acting on, which is the one thing this command exists to answer.
      const activeOrgId = resolved.profile.orgId;
      const activeIsForeign =
        activeOrgId !== undefined && !organizations.some((o) => o.organizationId === activeOrgId);

      if (organizations.length === 0 && !activeIsForeign && !isJsonMode()) {
        console.log(color.dim("No organizations found for this token."));
        return;
      }

      const listed: UserOrganization[] = activeIsForeign
        ? [
            {
              organizationId: activeOrgId,
              // Whatever was captured at login/switch. Hardcoding null here threw
              // away a name we may well have.
              name: resolved.profile.orgName ?? null,
              role: "platform-operator"
            },
            ...organizations
          ]
        : organizations;

      const rows = listed.map((org) => ({
        marker: org.organizationId === activeOrgId ? "▸" : " ",
        name: org.name ?? color.dim("—"),
        role: org.role,
        organizationId: org.organizationId
      }));

      printTable(rows, [
        { key: "marker", label: " ", width: 2 },
        { key: "name", label: "ORGANIZATION" },
        { key: "role", label: "ROLE" },
        { key: "organizationId", label: "ORG ID" }
      ]);

      // A prose trailer after printTable is a second thing on stdout. The row
      // already carries `role: "platform-operator"`, so --json loses nothing.
      if (activeIsForeign && !isJsonMode()) {
        console.log(
          color.dim(
            "\nThe active organization is outside your memberships — a platform-operator key " +
              "is acting on it. Every request is recorded in the admin audit log."
          )
        );
      }
    });

  // ── use-org ───────────────────────────────────────────────────────────
  auth
    .command("use-org")
    .description("Switch the active organization for a personal (cross-org) token")
    .argument("<orgId>", "Organization ID to activate (see: nexus auth orgs)")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth use-org org_abc123

Notes:
  Personal tokens act on one organization at a time, selected with the
  organization-id header. This sets the active org for the resolved profile
  without re-authenticating. Verifies you are a member first.`
    )
    .action(async (orgId: string) => {
      let resolved;
      try {
        resolved = resolveProfile(program.optsWithGlobals());
      } catch {
        process.exitCode = reportFailure(
          "not-authenticated",
          "Not logged in.",
          "Run: nexus auth login"
        );
        return;
      }

      // The prefix is the authoritative signal for "org-scoped" (the stored flag
      // may be absent on a manually-added or older-config profile). Precedence
      // lives in classifyUseOrgRefusal, which documents why.
      const refusal = classifyUseOrgRefusal({
        apiKey: resolved.profile.apiKey,
        personalToken: resolved.profile.personalToken,
        source: resolved.source
      });

      if (refusal === "org-scoped-key") {
        process.exitCode = refuse(
          `Profile "${resolved.name}" uses an organization-scoped key, which is bound to a ` +
            "single organization and cannot switch. Create a personal token to act across orgs: " +
            "Settings → API Keys → Personal Tokens, then `nexus auth login`."
        );
        return;
      }

      if (refusal === "env-override") {
        process.exitCode = refuse(
          "Cannot set an active org for an --api-key / NEXUS_API_KEY override. " +
            "Use the NEXUS_ORGANIZATION_ID env var instead."
        );
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      let organizations: UserOrganization[];
      try {
        organizations = await fetchOrganizations(baseUrl, resolved.profile.apiKey);
      } catch (err) {
        process.exitCode = reportFailure("connection-failed", (err as Error).message);
        return;
      }

      let match = organizations.find((org) => org.organizationId === orgId);
      let outsideMemberships = false;
      if (!match) {
        // `fetchOrganizations` lists MEMBERSHIPS. A platform-operator key
        // (NEX-3037) is defined by reaching orgs its owner is not a member of,
        // so refusing here would reject precisely the switch the credential
        // exists to perform — the membership list can never contain the target.
        //
        // Client-side only: the server still authorizes every request against
        // `PublicApiKey.isPlatformOperator`, so an ordinary user typing an
        // `nxs_o_`-shaped key gains nothing from this branch.
        if (!resolved.profile.apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX)) {
          process.exitCode = reportFailure(
            "not-found",
            `You are not a member of "${orgId}", or it does not exist.`,
            "Run: nexus auth orgs"
          );
          return;
        }
        // The name is unknown — it is not our org — so show the id and say why.
        // Prose BEFORE the success document is still two things on stdout, so
        // the human line stays human and the fact rides in the payload below.
        if (!isJsonMode()) {
          console.log(
            color.dim(
              `Platform-operator key: "${orgId}" is not one of your organizations. ` +
                "Switching anyway; every request will be recorded in the admin audit log."
            )
          );
        }
        outsideMemberships = true;
        match = { organizationId: orgId, name: null, role: "org:admin" };
      }

      try {
        setProfileOrganization(resolved.name, match.organizationId, match.name ?? undefined);
      } catch (err) {
        process.exitCode = reportFailure("local-failed", (err as Error).message);
        return;
      }

      printSuccess(`Active organization set to "${match.name ?? match.organizationId}".`, {
        profile: resolved.name,
        "org id": match.organizationId,
        role: match.role,
        outsideMemberships
      });
    });

  // ── status ────────────────────────────────────────────────────────────
  auth
    .command("status")
    .description("Verify the resolved profile's key against the API")
    .option(
      "--no-verify",
      "Skip the live check and report local configuration only (reports verified: null)"
    )
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth status

Notes:
  Shows profile resolution: --profile flag > NEXUS_PROFILE env > .nexusrc > active > "default".
  Use "nexus auth pin <profile>" to pin a directory to a profile via .nexusrc.

  THE ORG LINE IS A SECOND, SEPARATE RESOLUTION and it does not follow the
  profile. A cross-org token acts on whichever organization the
  organization-id header names: NEXUS_ORGANIZATION_ID if this shell exports one,
  otherwise the orgId stored on the profile. --json reports which as "orgSource"
  (env | profile | token); the human line marks the env case in place. Under the
  env case the stored organization NAME is withheld rather than shown, because it
  belongs to the profile's organization, not the one selected — a name beside the
  wrong id is worse than no name.

  A SIXTH SOURCE SITS ABOVE ALL FIVE: an explicit --api-key flag or a
  NEXUS_API_KEY environment variable. Either one overrides the resolved
  profile's key entirely and writes no profile of its own — this command reports
  it as "override". That is the case to look for when the key in use is not the
  key the named profile holds.

  IT VERIFIES THE KEY AGAINST THE API AND EXITS NON-ZERO WHEN THE KEY IS BAD.
  Exit 0 from this command means the key authenticated against the base URL
  reported on the "api:" line, at the moment it ran. Five failures and four
  codes — the code names the family, the message names which one it was:

    2  no profile, or the profile stores no key   -> nexus auth login
    2  the server read the key and refused it     -> nexus auth login
    7  the API could not be reached at all        -> check your network
    8  the check ran out of time                  -> raise --timeout
    6  the server was reached and errored         -> try again

  ⚠️ 7, 8 and 6 mean THE CREDENTIAL WAS NOT JUDGED. They are not a verdict that
  the key is bad, and treating them as one sends you to replace a key that may
  be fine.

  --no-verify skips the call and reports local configuration only. It exits 0
  whatever the key's real state is, and says so: the JSON "verified" field is
  null rather than true, because a check nobody ran is neither pass nor fail.
  Use it offline, or to inspect a profile for a host you cannot reach.

  "nexus auth whoami" answers a different question — WHO the key is, live, with
  the organization and user resolved from the API and cached back into the
  profile. Both verify; only whoami reports and refreshes the identity.`
    )
    .action(async (options: { verify: boolean }) => {
      try {
        const globals = program.optsWithGlobals();
        const resolved = resolveProfile(globals);

        const sourceExplanation: Record<string, string> = {
          flag: "--profile flag",
          env: "NEXUS_PROFILE environment variable",
          directory: `.nexusrc at ${resolved.rcPath}`,
          active: "active profile in config",
          default: 'fallback to "default" profile',
          override: "--api-key flag or NEXUS_API_KEY env"
        };

        const isCrossOrg =
          resolved.profile.personalToken === true || isCrossOrgToken(resolved.profile.apiKey);
        const isOperator = resolved.profile.apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX);

        // The organization the NEXT request will name, not the one the profile
        // happens to store: NEXUS_ORGANIZATION_ID is the per-shell org selector
        // and every command already obeys it. Reporting `profile.orgId` here
        // while the client sent the env's value made this command — the one
        // asked "which org am I in" — the only place that answered wrongly
        // (NEX-2525).
        const org = resolveOrganization(resolved.profile);
        // A stored orgName describes the PROFILE's organization. When the env
        // selects a DIFFERENT one, that name belongs to another tenant, and
        // printing it beside this id names the wrong customer — the same trap
        // `setProfileOrganization` documents. No name is better than a wrong one.
        const orgName =
          org.organizationId === resolved.profile.orgId ? resolved.profile.orgName : undefined;
        // Never the key itself, on either channel — the same eight-and-four
        // masking the human line has always used.
        const maskedKey = `${resolved.profile.apiKey.slice(0, 8)}...${resolved.profile.apiKey.slice(-4)}`;
        // Hoisted: the probe, the document and the human line must all name the
        // SAME host. Resolving it three times is three chances to disagree, and
        // a verdict reported against a host the reader was not shown is the
        // defect this command exists to close, one level down.
        const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();

        // ── The verification ────────────────────────────────────────────
        //
        // 🚨 THIS IS THE WHOLE POINT OF THE COMMAND, AND IT USED NOT TO HAPPEN.
        //
        // `auth status` read local config, found a key and exited 0 — over a key
        // the API had already stopped accepting. A sweep gated its preflight on
        // that exit code, passed, and then watched 63 of 69 calls fail on auth.
        // A verb named `status` that cannot fail on the state it reports turns a
        // one-command fix into an open-ended hunt.
        //
        // `--no-verify` keeps the old local-only read for the cases that need it
        // — offline, or inspecting a profile for a host you cannot reach. It is
        // OPT-IN, because the default has to be the honest answer.
        const probe = options.verify
          ? await probeCredential(baseUrl, resolved.profile.apiKey, {
              // The converter is named AT the call site on purpose: it is the one
              // place the unit changes, and the timeout gate reads this text to
              // prove the deadline is milliseconds and that the global flag can
              // still move it. A probe pinning its own deadline would make the
              // CLI's own "raise --timeout" advice a false instruction.
              signal: AbortSignal.timeout(
                timeoutSecondsToMs(globals.timeout) ?? AUTH_PROBE_DEFAULT_TIMEOUT_MS
              )
            })
          : null;
        const refusal =
          probe === null
            ? null
            : refusalForProbe(
                probe,
                resolved.name,
                baseUrl,
                // THIS verb declares `--no-verify`, so it may name it. `whoami`
                // does not and passes `null` — a shared hint naming a flag the
                // calling command lacks sends the reader to a commander error.
                "re-run with --no-verify"
              );

        // ── The document ────────────────────────────────────────────────
        //
        // `auth status` is the FIRST command an agent runs, and under --json it
        // answered with seven lines of prose: unparseable, at exit 0, so the
        // caller could tell neither which profile was loaded nor that anything
        // was wrong. Every fact the human lines carry is a field here, including
        // the two the reader has to act on — whether the token reaches other
        // organizations, and whether the org identity was ever cached.
        if (isJsonMode()) {
          // A failed verification is the error document and NOTHING ELSE — one
          // document on stdout is a promise of this CLI, and a caller branching
          // on `.error` must not have to also check a `verified` field it might
          // not know about. The refusal message carries the profile name and the
          // host, which is what the record would have told it.
          if (refusal) {
            process.exitCode = reportFailure(refusal.cause, refusal.message, refusal.hint);
            return;
          }
          printRecord({
            profile: resolved.name,
            source: resolved.source,
            sourceDescription: sourceExplanation[resolved.source],
            tokenType: isCrossOrg
              ? isOperator
                ? "platform-operator"
                : "personal"
              : "organization-scoped",
            orgName: orgName ?? null,
            orgId: org.organizationId ?? null,
            // Which selector chose that org: "env" (NEXUS_ORGANIZATION_ID, this
            // shell only), "profile" (stored, shared by every session on this
            // machine), or "token" (nothing selected — the key's own org).
            orgSource: org.source,
            userEmail: resolved.profile.userEmail ?? null,
            apiKey: maskedKey,
            baseUrl,
            // 🚨 THREE VALUES, NEVER TWO. `true` means the API accepted this key
            // just now; `null` means `--no-verify` and NOBODY ASKED. A check
            // that did not run must not wear a clean result — `false` would say
            // the key was judged and failed, which is a different fact and one
            // this document never reports (a failed check is the error document
            // above, at a non-zero exit).
            verified: probe === null ? null : true,
            // The org/user fields above are the profile's CACHE. `whoami`
            // refreshes them; an absent identity means "never resolved", not
            // "no organization" — and `verified: true` says nothing about how
            // old they are.
            identityCached: Boolean(resolved.profile.orgName ?? resolved.profile.orgId)
          });
          return;
        }

        const orgPart = orgName ? ` (${orgName})` : "";
        console.log(
          `Using profile ${color.cyan(`"${resolved.name}"`)}${orgPart} — ${color.dim(sourceExplanation[resolved.source])}`
        );
        // The stored flag is absent for a key supplied via --api-key or
        // NEXUS_API_KEY (source "override"), which writes no profile — so gating
        // on it alone meant the cross-tenant credential went unlabelled in
        // exactly the ad-hoc invocation most likely to be a one-off against
        // someone else's tenant. `use-org` already resolves this the same way.
        if (isCrossOrg) {
          // The two org-unbound kinds are NOT interchangeable to the reader:
          // one reaches your own orgs, the other reaches every tenant on the
          // platform and audits each request. Printing both as "personal token"
          // hides which credential is loaded, which is the thing `status` is for.
          console.log(
            `  ${color.dim("type:")} ${
              isOperator ? "platform-operator key (any org, audited)" : "personal token (cross-org)"
            } — ${color.dim('switch org with "nexus auth use-org <orgId>"')}`
          );
        }
        if (org.organizationId) {
          const via =
            org.source === "env" ? color.dim(" (from NEXUS_ORGANIZATION_ID, this shell only)") : "";
          console.log(`  ${color.dim("org id:")} ${org.organizationId}${via}`);
        }
        if (resolved.profile.userEmail) {
          console.log(`  ${color.dim("user:")} ${resolved.profile.userEmail}`);
        }
        console.log(`  ${color.dim("key:")} ${maskedKey}`);
        console.log(`  ${color.dim("api:")} ${baseUrl}`);

        // The human channel prints the resolution FIRST and the verdict after,
        // on both outcomes. "Which profile is dead" is the fact a reader needs
        // and the one a bare refusal cannot carry — and the `--json` funnel
        // keeps this from becoming two documents on stdout.
        if (refusal) {
          process.exitCode = reportFailure(refusal.cause, refusal.message, refusal.hint);
          return;
        }
        if (probe === null) {
          // An unrun check must announce itself. Silence here reads as a pass,
          // which is the exact false green `--no-verify` is allowed to produce.
          console.log(
            color.dim("\n  NOT VERIFIED — --no-verify skipped the live check. The key may be dead.")
          );
        } else {
          console.log(`\n  ${color.green("verified")} ${color.dim(`— the API accepted this key`)}`);
        }
        if (!resolved.profile.orgName && !resolved.profile.orgId) {
          console.log(
            color.dim('  Run "nexus auth whoami" to resolve and cache org/user identity.')
          );
        }
      } catch (err) {
        // `resolveProfile` refusing to find a credential at all — no profiles
        // configured, or a named one that does not exist. The probe itself never
        // throws; every one of its failures is a member of its return union.
        process.exitCode = reportFailure("not-authenticated", (err as Error).message);
      }
    });

  // ── whoami ────────────────────────────────────────────────────────────
  auth
    .command("whoami")
    .description("Show the active profile, organization, and authenticated user")
    .addHelpText(
      "after",
      `
Examples:
  $ nexus auth whoami

Notes:
  Calls the API live to resolve the current org name, org ID, and user email
  for the active profile's key, so you always know which org you're acting on.

  A PROFILE NAME THAT DOES NOT EXIST REPORTS AS "Not logged in". So
  "--profile <typo>" sends you to run "nexus auth login" when you are already
  logged in and only misspelled the name. Before re-authenticating, run
  "nexus auth status --profile <name>" — it distinguishes the two and lists the
  profiles that do exist.`
    )
    .action(async () => {
      const globals = program.optsWithGlobals();
      let resolved;
      try {
        resolved = resolveProfile(globals);
      } catch {
        process.exitCode = reportFailure(
          "not-authenticated",
          "Not logged in.",
          "Run: nexus auth login"
        );
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      const keyHint =
        resolved.profile.apiKey.slice(0, 8) + "..." + resolved.profile.apiKey.slice(-4);

      // whoami is a LIVE verification command: any failure to confirm the key
      // (network error, timeout, or a non-ok server response) must be reported
      // as such — never a false "Authenticated.".
      //
      // 🚨 THE PROBE IS SHARED WITH `auth status` AND IS NOT REIMPLEMENTED HERE.
      // Both verbs answer "is this key good", and this file used to hold the only
      // correct copy while `status` had none. Two copies of that answer is two
      // things to drift, silently, in the direction that reads as fine — so the
      // mapping lives in `auth-probe.ts` and neither verb owns it.
      //
      // Behaviour preserved exactly, with ONE narrowing that the old bare `catch`
      // could not express: a TIMEOUT now reports as `timed-out` rather than as
      // `connection-failed`. They are different facts — a timeout may still be
      // running server-side, an unreachable host is not — and collapsing them is
      // the same defect one layer down.
      const outcome = await probeCredential(baseUrl, resolved.profile.apiKey, {
        // Same form as `status` above, and for the same reason — see the comment
        // there. Both verbs are one probe with one deadline the caller sets.
        signal: AbortSignal.timeout(
          timeoutSecondsToMs(globals.timeout) ?? AUTH_PROBE_DEFAULT_TIMEOUT_MS
        )
      });
      // `null`: `whoami` declares no `--no-verify` and has no way to skip the
      // check — verifying live IS the command. Naming a flag it does not have
      // would point the reader at an invocation commander rejects.
      const whoamiRefusal = refusalForProbe(outcome, resolved.name, baseUrl, null);
      if (whoamiRefusal) {
        process.exitCode = reportFailure(
          whoamiRefusal.cause,
          whoamiRefusal.message,
          whoamiRefusal.hint
        );
        return;
      }

      // `identity` is null on the legacy path: a backend with no `/me`, where the
      // key is still PROVEN good by the fallback probe and there is simply no live
      // identity to report. The stored profile answers for it below.
      const identity = outcome.outcome === "verified" ? (outcome.identity ?? undefined) : undefined;

      // Mirror the authoritative /me identity into the stored profile so
      // `list`/`status` reflect reality. This is a SYNC, not a merge: a field the
      // live response omits/nulls is cleared from the cache, so a stale org or
      // email can't linger after the real value changes.
      //
      // Skip the write for an ephemeral `--api-key` / `NEXUS_API_KEY` override —
      // `resolveProfile` names that result "override"; persisting it would write
      // a bogus "override" profile into config.json.
      if (identity && resolved.source !== "override") {
        const synced: NexusProfile = { ...resolved.profile };
        setOrClear(synced, "orgName", identity.orgName);
        setOrClear(synced, "orgId", identity.orgId);
        setOrClear(synced, "userEmail", identity.userEmail);
        if (
          synced.orgName !== resolved.profile.orgName ||
          synced.orgId !== resolved.profile.orgId ||
          synced.userEmail !== resolved.profile.userEmail
        ) {
          // Best-effort cache refresh: a write failure (read-only FS, disk full,
          // permissions) must not fail whoami and must not be reported as a
          // failure to reach the API — auth already succeeded and the live
          // identity is still shown below.
          try {
            saveProfile(resolved.name, synced);
          } catch {
            // ignore — caching is an optimization, not the command's purpose
          }
        }
      }

      // Reaching here means the key was verified. When /me answered, its
      // identity is authoritative — show exactly that (don't fall back to a
      // just-cleared stale profile value). Only the 404 legacy path, where we
      // have no live identity, reads the locally stored profile.
      const orgName = identity ? identity.orgName : resolved.profile.orgName;
      const orgId = identity ? identity.orgId : resolved.profile.orgId;
      const userEmail = identity ? identity.userEmail : resolved.profile.userEmail;

      printSuccess("Authenticated.", {
        profile: resolved.name,
        ...(orgName ? { organization: orgName } : {}),
        ...(orgId ? { "org id": orgId } : {}),
        ...(userEmail ? { user: userEmail } : {}),
        ...(identity?.role ? { role: identity.role } : {}),
        api: baseUrl,
        key: keyHint
      });
    });
}

/**
 * Mirror an authoritative live value into a profile field: set it when present,
 * delete it when the live response omits/nulls it (so stale values don't linger).
 */
function setOrClear(
  profile: NexusProfile,
  key: "orgName" | "orgId" | "userEmail",
  value: string | undefined | null
): void {
  if (value) profile[key] = value;
  else delete profile[key];
}

/**
 * Refuse a scoped switch to a profile that does not exist, naming the ones that
 * do. The machine-wide path gets the same refusal from `setActiveProfile`; the
 * scoped paths need it BEFORE they write a `.nexusrc` or print an export line,
 * because either one would otherwise bind the session to a name that resolves to
 * nothing and fails on the next command instead of this one.
 */
function refuseUnknownProfile(name: string): number {
  const available = Object.keys(listProfiles().profiles).join(", ");
  return reportFailure(
    "not-found",
    `Profile "${name}" not found.`,
    available ? `Available: ${available}. Run: nexus auth list` : "Run: nexus auth login"
  );
}

/**
 * `auth switch <name> --here` — bind THIS DIRECTORY, leaving the machine-wide
 * active profile untouched.
 *
 * This is the same `.nexusrc` `auth pin` writes, reached from the verb people
 * actually use to change organizations. That matters more than it sounds: a
 * reader who knows only `switch` has no way to discover that the isolating form
 * exists, and the machine-wide switch they do know silently repoints every other
 * session (NEX-2525).
 */
function switchHere(name: string): void {
  const profile = getProfile(name);
  if (!profile) {
    process.exitCode = refuseUnknownProfile(name);
    return;
  }

  try {
    writeNexusRc(process.cwd(), name);
  } catch (err) {
    process.exitCode = reportFailure("local-failed", (err as Error).message);
    return;
  }

  const orgPart = profile.orgName ? ` (${profile.orgName})` : "";
  printSuccess(`This directory now resolves to "${name}"${orgPart}.`, {
    profile: name,
    scope: "directory",
    file: ".nexusrc"
  });
  if (!isJsonMode()) {
    console.log(
      color.dim(
        "\n  Applies here and below, in every shell; other directories and sessions are unchanged." +
          "\n  Remove it with: nexus auth unpin · Consider adding .nexusrc to your .gitignore"
      )
    );
  }

  if (switchIsShadowed(name)) process.exitCode = 1;
}

/**
 * `auth switch <name> --session` — bind THIS SHELL, writing nothing anywhere.
 *
 * A process cannot set a variable in the shell that spawned it, so the binding
 * is DELIVERED rather than applied: one `export` line on stdout, meant for
 * `eval "$(...)"`. Everything else — the confirmation, any warning — goes to
 * stderr, because a single stray byte on stdout is evaluated as shell code.
 */
function switchSession(name: string): void {
  const profile = getProfile(name);
  if (!profile) {
    process.exitCode = refuseUnknownProfile(name);
    return;
  }

  // The output of this one command is EXECUTED by the caller's shell, so the
  // name is re-validated against the same pattern `auth login` enforces before
  // it is interpolated. A profile name only reaches this branch by being in
  // config.json, which is a file a human can hand-edit — and shell-quoting a
  // value is a weaker guarantee than refusing to emit a name that never had to
  // be quoted in the first place.
  const invalid = validateProfileName(name);
  if (invalid) {
    process.exitCode = refuse(
      invalid,
      "This name cannot be emitted as shell code. Rename the profile, or use --here / --profile."
    );
    return;
  }

  const exportLine = `export NEXUS_PROFILE="${name}"`;
  const orgPart = profile.orgName ? ` (${profile.orgName})` : "";

  // NEXUS_PROFILE is the only selector this binding sets, and NEXUS_API_KEY
  // outranks it — an exported key would keep winning in the very shell the user
  // just bound. `switchIsShadowed` cannot see this: it resolves the CURRENT
  // environment, which does not have NEXUS_PROFILE set yet.
  //
  // Before the line rather than after it, and the line is still printed: the
  // user may be one `unset` away from meaning it, and a refusal that prints
  // nothing would cost them the command as well as the binding.
  if (process.env.NEXUS_API_KEY) {
    printWarning(
      "NEXUS_API_KEY is set in this shell — it outranks NEXUS_PROFILE, so this binding will NOT take effect.",
      "Unset it (unset NEXUS_API_KEY) in this shell, then eval the line again.",
      "Commands keep using the NEXUS_API_KEY credential until then."
    );
    process.exitCode = 1;
  }

  if (isJsonMode()) {
    printSuccess(`Eval the export line to bind this shell to "${name}"${orgPart}.`, {
      profile: name,
      scope: "session",
      variable: "NEXUS_PROFILE",
      value: name,
      exportLine
    });
  } else {
    // stdout: the line, alone. Anything else here lands inside the caller's eval.
    console.log(exportLine);
    process.stderr.write(
      color.dim(
        `  This shell → "${name}"${orgPart} once eval'd; nothing was written to disk.\n` +
          `  Run: eval "$(nexus auth switch ${name} --session)"\n`
      )
    );
  }
}

/**
 * Wrong-org guard (NEX-2361): switching a profile only changes what ONE level of
 * the resolution chain picks. A higher-precedence selector that PERSISTS across
 * processes — NEXUS_API_KEY (override), NEXUS_PROFILE, or a `.nexusrc` pin —
 * still wins, so a subsequent command keeps using THAT credential, not the one
 * just switched to. Left silent, `auth switch org-b && workspace mount` would
 * operate on the override's org while the user believes they're on org B. Detect
 * the mismatch, warn loudly, and exit non-zero so the dangerous `&&` chain halts.
 *
 * Resolve with NO opts: we're predicting what the NEXT process resolves to, and
 * the ephemeral --api-key / --profile flags on THIS invocation do not carry over
 * to it. Forwarding them would falsely flag `nexus --api-key X auth switch org-b
 * && nexus workspace mount`, whose second (flag-less) command correctly resolves
 * to org-b.
 *
 * Shared by the machine-wide switch and `--here`: both change what a later
 * process resolves to, and both can be shadowed by the same three selectors. It
 * does NOT serve `--session`, whose binding is not in this process's environment
 * yet and so cannot be predicted by resolving it.
 *
 * It WARNS but does not exit: the caller sets `process.exitCode`, in the scope
 * that already put the success document on stdout. Setting it here instead puts
 * a prose-only refusal in a scope with no document, which is the shape
 * `json-error-document.static-scan` reports — and it would be right to, because
 * from inside this function nothing can tell that stdout was already served.
 */
function switchIsShadowed(name: string): boolean {
  let effective: ResolvedProfile | undefined;
  try {
    effective = resolveProfile();
  } catch {
    // No resolvable profile (shouldn't happen right after a successful switch) —
    // nothing to compare against, so skip the guard.
    effective = undefined;
  }
  if (!effective) return false;

  // An "override" source means the NEXUS_API_KEY env credential wins; its name
  // is the literal sentinel "override", NOT a real profile identity, so we must
  // warn even when the just-switched profile is itself named "override" (a legal
  // profile name) — the env key still shadows it. For NEXUS_PROFILE / .nexusrc
  // the name IS a real profile, so a true match means the switch is effective and
  // no warning is needed.
  if (effective.source === "override" || effective.name !== name) {
    warnSwitchIneffective(name, effective);
    return true;
  }
  return false;
}

/**
 * Warn that a just-completed `auth switch` will NOT take effect because a
 * higher-precedence selector resolves to a different credential. The message is
 * tailored to the winning source so the user knows exactly what to unset.
 */
function warnSwitchIneffective(switchedTo: string, effective: ResolvedProfile): void {
  // Resolution runs with no ephemeral flags, so an "override" source here can
  // only come from the persistent NEXUS_API_KEY env var.
  if (effective.source === "override") {
    printWarning(
      `NEXUS_API_KEY is set — the switched profile will NOT take effect.`,
      `Unset it (unset NEXUS_API_KEY), or pass --profile ${switchedTo} per command.`,
      `Commands keep using the NEXUS_API_KEY credential until then.`
    );
    return;
  }

  if (effective.source === "env") {
    printWarning(
      `NEXUS_PROFILE="${effective.name}" overrides the active profile — the switch will NOT take effect.`,
      `Rebind this shell: eval "$(nexus auth switch ${switchedTo} --session)"`,
      `Or unset it (unset NEXUS_PROFILE), or pass --profile ${switchedTo} per command.`,
      `Commands keep using profile "${effective.name}" until then.`
    );
    return;
  }

  if (effective.source === "directory") {
    printWarning(
      `This directory is pinned to "${effective.name}" via .nexusrc — the switch will NOT take effect here.`,
      `Move the pin: nexus auth switch ${switchedTo} --here`,
      `Or run "nexus auth unpin", or pass --profile ${switchedTo} per command.`,
      `Commands in this directory keep using profile "${effective.name}" until then.`
    );
    return;
  }

  // Fallback for any other unexpected mismatch.
  printWarning(
    `The switch may NOT take effect — commands resolve to profile "${effective.name}", not "${switchedTo}".`,
    `Pass --profile ${switchedTo} per command to be explicit.`
  );
}

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

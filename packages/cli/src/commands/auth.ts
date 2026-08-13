import { exec } from "node:child_process";
import { stdin, stdout } from "node:process";
import readline from "node:readline/promises";

import { Command } from "commander";

import {
  clearConfig,
  getProfile,
  listProfiles,
  type NexusProfile,
  removeNexusRc,
  removeProfile,
  resolveBaseUrl,
  type ResolvedProfile,
  resolveProfile,
  saveProfile,
  setActiveProfile,
  setProfileOrganization,
  slugifyProfileName,
  validateProfileName,
  writeNexusRc
} from "../config";
import { color, printSuccess, printTable, printWarning } from "../output";

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
function isCrossOrgToken(apiKey: string): boolean {
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
            console.error(color.red("Error:") + " " + (err as Error).message);
            process.exitCode = 1;
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
              console.error(
                color.red("Error:") +
                  " A platform-operator key must name the organization it acts on."
              );
              process.exitCode = 1;
              return;
            }
            orgId = entered;
            orgName = organizations.find((o) => o.organizationId === entered)?.name ?? undefined;
          }

          // Personal tokens genuinely cannot act without a membership; the
          // platform-operator case already has its org from the block above.
          if (organizations.length === 0 && !isPlatformOperatorKey) {
            console.error(
              color.red("Error:") + " This token's user does not belong to any organization."
            );
            process.exitCode = 1;
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
                console.error(color.red("Error:") + " Invalid selection.");
                process.exitCode = 1;
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
            console.error(
              color.red("Error:") +
                ` Validation failed (HTTP ${validateRes.status}). Check your key and try again.`
            );
            process.exitCode = 1;
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

      // Wrong-org guard (NEX-2361): switching the active profile only changes
      // what `active` resolution picks. A higher-precedence selector that
      // PERSISTS across processes — NEXUS_API_KEY (override), NEXUS_PROFILE, or
      // a .nexusrc pin — still wins, so a subsequent command keeps using THAT
      // credential, not the one just switched to. Left silent,
      // `auth switch org-b && workspace mount` would operate on the override's
      // org while the user believes they're on org B. Detect the mismatch, warn
      // loudly, and exit non-zero so the dangerous `&&` chain halts.
      //
      // Resolve with NO opts: we're predicting what the NEXT process resolves
      // to, and the ephemeral --api-key / --profile flags on THIS invocation do
      // not carry over to it. Forwarding them would falsely flag
      // `nexus --api-key X auth switch org-b && nexus workspace mount`, whose
      // second (flag-less) command correctly resolves to org-b.
      let effective: ReturnType<typeof resolveProfile> | undefined;
      try {
        effective = resolveProfile();
      } catch {
        // No resolvable profile (shouldn't happen right after a successful
        // switch) — nothing to compare against, so skip the guard.
        effective = undefined;
      }

      // An "override" source means the NEXUS_API_KEY env credential wins; its
      // name is the literal sentinel "override", NOT a real profile identity,
      // so we must warn even when the just-switched profile is itself named
      // "override" (a legal profile name) — the env key still shadows it. For
      // NEXUS_PROFILE / .nexusrc the name IS a real profile, so a true match
      // means the switch is effective and no warning is needed.
      const shadowed = effective && (effective.source === "override" || effective.name !== name);
      if (shadowed && effective) {
        warnSwitchIneffective(name, effective);
        process.exitCode = 1;
      }
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
  $ nexus auth pin work

Notes:
  IT WRITES ./.nexusrc IN THE CURRENT DIRECTORY, holding {"profile":"<name>"}
  and nothing else. It names a profile; it stores no key.

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
      let resolved;
      try {
        resolved = resolveProfile(program.optsWithGlobals());
      } catch {
        console.error(color.red("Error:") + " Not logged in. Run: nexus auth login");
        process.exitCode = 1;
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      let organizations: UserOrganization[];
      try {
        organizations = await fetchOrganizations(baseUrl, resolved.profile.apiKey);
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
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

      if (organizations.length === 0 && !activeIsForeign) {
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

      if (activeIsForeign) {
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
        console.error(color.red("Error:") + " Not logged in. Run: nexus auth login");
        process.exitCode = 1;
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
        console.error(
          color.red("Error:") +
            ` Profile "${resolved.name}" uses an organization-scoped key, which is bound to a ` +
            "single organization and cannot switch. Create a personal token to act across orgs: " +
            "Settings → API Keys → Personal Tokens, then `nexus auth login`."
        );
        process.exitCode = 1;
        return;
      }

      if (refusal === "env-override") {
        console.error(
          color.red("Error:") +
            " Cannot set an active org for an --api-key / NEXUS_API_KEY override. " +
            "Use the NEXUS_ORGANIZATION_ID env var instead."
        );
        process.exitCode = 1;
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      let organizations: UserOrganization[];
      try {
        organizations = await fetchOrganizations(baseUrl, resolved.profile.apiKey);
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
        return;
      }

      let match = organizations.find((org) => org.organizationId === orgId);
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
          console.error(
            color.red("Error:") +
              ` You are not a member of "${orgId}", or it does not exist. ` +
              "Run: nexus auth orgs"
          );
          process.exitCode = 1;
          return;
        }
        // The name is unknown — it is not our org — so show the id and say why.
        console.log(
          color.dim(
            `Platform-operator key: "${orgId}" is not one of your organizations. ` +
              "Switching anyway; every request will be recorded in the admin audit log."
          )
        );
        match = { organizationId: orgId, name: null, role: "org:admin" };
      }

      try {
        setProfileOrganization(resolved.name, match.organizationId, match.name ?? undefined);
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
        return;
      }

      printSuccess(`Active organization set to "${match.name ?? match.organizationId}".`, {
        profile: resolved.name,
        "org id": match.organizationId,
        role: match.role
      });
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
  Use "nexus auth pin <profile>" to pin a directory to a profile via .nexusrc.

  A SIXTH SOURCE SITS ABOVE ALL FIVE: an explicit --api-key flag or a
  NEXUS_API_KEY environment variable. Either one overrides the resolved
  profile's key entirely and writes no profile of its own — this command reports
  it as "override". That is the case to look for when the key in use is not the
  key the named profile holds.

  🚨 IT READS LOCAL CONFIG AND MAKES NO NETWORK CALL, SO IT IS NOT VERIFICATION.
  A revoked, expired or mistyped key still reports here exactly as it did the
  day it was stored, and the org and user lines are whatever was cached last —
  stale, or absent if nothing ever cached them. "This command succeeded" is not
  evidence the key works. Run "nexus auth whoami" for that: it resolves against
  the API live, and it is also what fills those lines in when they are missing.`
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
        // The stored flag is absent for a key supplied via --api-key or
        // NEXUS_API_KEY (source "override"), which writes no profile — so gating
        // on it alone meant the cross-tenant credential went unlabelled in
        // exactly the ad-hoc invocation most likely to be a one-off against
        // someone else's tenant. `use-org` already resolves this the same way.
        if (resolved.profile.personalToken === true || isCrossOrgToken(resolved.profile.apiKey)) {
          // The two org-unbound kinds are NOT interchangeable to the reader:
          // one reaches your own orgs, the other reaches every tenant on the
          // platform and audits each request. Printing both as "personal token"
          // hides which credential is loaded, which is the thing `status` is for.
          const isOperator = resolved.profile.apiKey.startsWith(PLATFORM_OPERATOR_TOKEN_PREFIX);
          console.log(
            `  ${color.dim("type:")} ${
              isOperator ? "platform-operator key (any org, audited)" : "personal token (cross-org)"
            } — ${color.dim('switch org with "nexus auth use-org <orgId>"')}`
          );
        }
        if (resolved.profile.orgId) {
          console.log(`  ${color.dim("org id:")} ${resolved.profile.orgId}`);
        }
        if (resolved.profile.userEmail) {
          console.log(`  ${color.dim("user:")} ${resolved.profile.userEmail}`);
        }
        console.log(
          `  ${color.dim("key:")} ${resolved.profile.apiKey.slice(0, 8)}...${resolved.profile.apiKey.slice(-4)}`
        );
        console.log(`  ${color.dim("api:")} ${resolved.profile.baseUrl ?? resolveBaseUrl()}`);
        if (!resolved.profile.orgName && !resolved.profile.orgId) {
          console.log(
            color.dim('\n  Run "nexus auth whoami" to resolve and cache org/user identity.')
          );
        }
      } catch (err) {
        console.error(color.red("Error:") + " " + (err as Error).message);
        process.exitCode = 1;
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
      let resolved;
      try {
        resolved = resolveProfile(program.optsWithGlobals());
      } catch {
        console.error(color.red("Error:") + " Not logged in. Run: nexus auth login");
        process.exitCode = 1;
        return;
      }

      const baseUrl = resolved.profile.baseUrl ?? resolveBaseUrl();
      const keyHint =
        resolved.profile.apiKey.slice(0, 8) + "..." + resolved.profile.apiKey.slice(-4);

      // whoami is a LIVE verification command: any failure to confirm the key
      // (network error, timeout, or a non-ok server response) must be reported
      // as such — never a false "Authenticated.". The only graceful path is a
      // 404 from /me, which means the backend predates this endpoint; there we
      // fall back to the legacy /agents validity probe and show stored fields.
      const requestInit = {
        headers: { "api-key": resolved.profile.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000)
      };

      const invalidKey = (): void => {
        console.error(
          color.red("Error:") + " API key is invalid or expired. Run: nexus auth login"
        );
        process.exitCode = 1;
      };

      let identity:
        | { orgId?: string; orgName?: string; userEmail?: string; userName?: string; role?: string }
        | undefined;
      try {
        const res = await fetch(`${baseUrl}/api/public/v1/me`, requestInit);

        if (res.status === 401 || res.status === 403) {
          invalidKey();
          return;
        }

        if (res.ok) {
          const json = (await res.json()) as {
            data?: {
              orgId?: string;
              orgName?: string;
              userEmail?: string;
              userName?: string;
              role?: string;
            };
          };
          identity = json.data;

          // Mirror the authoritative /me identity into the stored profile so
          // `list`/`status` reflect reality. This is a SYNC, not a merge: a
          // field the live response omits/nulls is cleared from the cache, so a
          // stale org or email can't linger after the real value changes.
          //
          // Skip the write for an ephemeral `--api-key` / `NEXUS_API_KEY`
          // override — `resolveProfile` names that result "override"; persisting
          // it would write a bogus "override" profile into config.json.
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
              // Best-effort cache refresh: a write failure (read-only FS, disk
              // full, permissions) must not fail whoami or surface as the outer
              // catch's "could not reach the API" — auth already succeeded and
              // the live identity is still shown below.
              try {
                saveProfile(resolved.name, synced);
              } catch {
                // ignore — caching is an optimization, not the command's purpose
              }
            }
          }
        } else if (res.status === 404) {
          // Older backend without /me — fall back to a plain validity probe so
          // whoami still works, just without live org/user identity.
          const probe = await fetch(`${baseUrl}/api/public/v1/agents?limit=1`, requestInit);
          if (probe.status === 401 || probe.status === 403) {
            invalidKey();
            return;
          }
          if (!probe.ok) {
            console.error(
              color.red("Error:") +
                ` Could not verify credentials (HTTP ${probe.status}). Try again.`
            );
            process.exitCode = 1;
            return;
          }
        } else {
          console.error(
            color.red("Error:") + ` Could not verify credentials (HTTP ${res.status}). Try again.`
          );
          process.exitCode = 1;
          return;
        }
      } catch {
        console.error(
          color.red("Error:") +
            " Could not reach the API to verify credentials. Check your connection and try again."
        );
        process.exitCode = 1;
        return;
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
      `Unset it (unset NEXUS_PROFILE), or pass --profile ${switchedTo} per command.`,
      `Commands keep using profile "${effective.name}" until then.`
    );
    return;
  }

  if (effective.source === "directory") {
    printWarning(
      `This directory is pinned to "${effective.name}" via .nexusrc — the switch will NOT take effect here.`,
      `Run "nexus auth unpin", or pass --profile ${switchedTo} per command.`,
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

/**
 * Reaching the upstream repository: the credential, and the one read this gate
 * makes. Nothing here decides anything — it fetches, and reports HOW a fetch
 * failed so the caller can turn that into a state.
 *
 * Kept apart from `verdict.ts` so the comparison logic can be driven by a
 * scripted transport in the self-test without a network, and so a change to how
 * GitHub is reached cannot quietly alter what a verdict MEANS.
 */

import { execSync } from "node:child_process";

export const REPO = "NexusGPT/claude-code-skills-nexus";
export const BRANCH = "main";

/** The single network capability this checker needs, so a test can supply it. */
export type ReadResult =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; statusText: string }
  | { kind: "transport"; message: string };

export type GitHubReader = (apiPath: string) => Promise<ReadResult>;

// ── the real transport ───────────────────────────────────────────────────────

/**
 * Resolve a credential, most specific first.
 *
 * `SKILLS_NEXUS_READ_TOKEN` leads because it is the only name that MEANS this.
 * A workflow that fell back to the ambient `GITHUB_TOKEN` would get a 404 from
 * a private repository it cannot read and report a puzzle; a purpose-named
 * secret that is simply absent reports NO_TOKEN and names itself. The other two
 * exist so a human running this locally needs no setup, and they mirror
 * `bundle-skills.ts` exactly rather than inventing a second convention.
 */
export function resolveToken(): string | null {
  const named = process.env.SKILLS_NEXUS_READ_TOKEN;
  if (named !== undefined && named !== "") return named;
  const ambient = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (ambient !== undefined && ambient !== "") return ambient;

  // The `gh` fallback is a LOCAL convenience and is refused on a runner.
  //
  // On GitHub Actions the only credential that belongs here is the purpose-named
  // secret. If `gh` happened to be authenticated there, this would hand back a
  // token scoped to THIS repository, earn a 404 from the private source, and
  // report UPSTREAM_NOT_FOUND — sending whoever reads it hunting for a
  // mis-scoped token that was never configured, when the true answer is that
  // the secret does not exist yet. Same state either way; the wrong remedy.
  // This check's first run in production is a CANNOT_CHECK, so that message has
  // to be the right one.
  if (process.env.GITHUB_ACTIONS === "true") return null;

  try {
    const fromCli = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return fromCli === "" ? null : fromCli;
  } catch {
    return null;
  }
}

export function githubReader(token: string): GitHubReader {
  return async (apiPath) => {
    let res: Response;
    try {
      res = await fetch(`https://api.github.com/repos/${REPO}${apiPath}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "nexus-cli-check-skills-drift"
        }
      });
    } catch (error) {
      return {
        kind: "transport",
        message: error instanceof Error ? error.message : String(error)
      };
    }
    if (!res.ok) return { kind: "http", status: res.status, statusText: res.statusText };
    try {
      return { kind: "ok", body: (await res.json()) as unknown };
    } catch (error) {
      // A 200 whose body will not parse is not a readable answer. Reported as a
      // transport failure so it lands in CANNOT_CHECK rather than throwing out
      // of the checker with no verdict at all.
      return {
        kind: "transport",
        message: `200 with an unparseable body: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  };
}

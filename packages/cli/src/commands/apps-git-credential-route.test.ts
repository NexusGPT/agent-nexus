import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setJsonMode } from "../output";
import type { VibeGitCredentialParts } from "./apps/git-local/credential-parts";

/**
 * Which credential `git-credentials`, `git-project clone` and `git-project pull`
 * ask the backend for, and what they hand git — read off the commands as they
 * actually run, with the network and the git subprocess replaced.
 *
 * The org-wide route serves the platform admin's token, which pushes to every
 * repository in the tenant; a copy of it in a developer's keychain is the defect
 * these commands once had. So every path asserted here is the PER-PROJECT route,
 * and every git argv starts by resetting the user's credential helpers.
 */
const tenantRequest = vi.fn();
vi.mock("../util/tenant-http", () => ({
  tenantRequest: (...args: unknown[]) => tenantRequest(...args)
}));

const gitCalls: { operation: string; credentials: VibeGitCredentialParts; argv: string[] }[] = [];
vi.mock("./apps/git-local/run-git-with-credential", () => ({
  runGitWithCredential: (
    credentials: VibeGitCredentialParts,
    operation: string,
    buildArgs: (path: string) => string[]
  ) => {
    gitCalls.push({ operation, credentials, argv: buildArgs("/tmp/nx/credentials") });
  }
}));
vi.mock("./apps/git-local/assert-git-available", () => ({ assertGitAvailable: () => undefined }));
vi.mock("./apps/git-local/assert-git-repository", () => ({
  assertGitRepository: () => undefined
}));

import { registerAppsCommands } from "./apps";

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const ORG_WIDE_ROUTE = "/api/vibe/git-credentials";
const PROJECT_ROUTE = `/api/vibe/git-projects/${PROJECT_ID}/credentials`;
const PROJECT_CREDENTIALS = {
  gitProjectId: PROJECT_ID,
  gitProjectName: "shared-lib",
  gitHostName: "git.acme.gpt.nexus",
  forgejoOrg: "vibe",
  username: "vibe-p-11111111222243338444555555555555",
  pushToken: "per-project-token",
  cloneUrl: "https://git.acme.gpt.nexus/vibe/shared-lib.git"
};

/** Answer each route the commands may ask for; an unexpected path throws. */
tenantRequest.mockImplementation((_opts: unknown, req: { path: string }) => {
  if (req.path === `/api/vibe/git-projects/${PROJECT_ID}`) {
    return Promise.resolve({
      gitProject: { id: PROJECT_ID, name: "shared-lib", status: "READY", defaultBranch: "main" }
    });
  }
  if (req.path === PROJECT_ROUTE) return Promise.resolve({ credentials: PROJECT_CREDENTIALS });
  return Promise.reject(new Error(`unexpected route ${req.path}`));
});

async function run(argv: string[]): Promise<string[]> {
  const program = new Command();
  program.name("nexus").option("--json", "Output as JSON").exitOverride();
  registerAppsCommands(program);
  setJsonMode(true);
  const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  try {
    await program.parseAsync(["node", "nexus", "--json", ...argv]);
  } finally {
    spy.mockRestore();
    setJsonMode(false);
  }
  return tenantRequest.mock.calls.map((call) => (call[1] as { path: string }).path);
}

afterEach(() => {
  tenantRequest.mockClear();
  gitCalls.length = 0;
  process.exitCode = undefined;
});

describe.each([
  ["git-project clone", ["apps", "git-project", "clone", PROJECT_ID], "clone"],
  ["git-project pull", ["apps", "git-project", "pull", PROJECT_ID, "."], "pull"]
])("apps %s", (_label, argv, operation) => {
  it("asks for the per-project credential and never the org-wide one", async () => {
    const paths = await run(argv);
    expect(process.exitCode ?? 0).toBe(0);
    expect(paths).toContain(PROJECT_ROUTE);
    expect(paths).not.toContain(ORG_WIDE_ROUTE);
  });

  it("hands git the per-project credential, with every configured helper reset first", async () => {
    await run(argv);
    expect(gitCalls).toHaveLength(1);
    const [call] = gitCalls;
    expect(call?.operation).toBe(operation);
    expect(call?.credentials.username).toBe(PROJECT_CREDENTIALS.username);
    const helpers = (call?.argv ?? []).filter((arg) => arg.startsWith("credential.helper="));
    expect(helpers).toEqual([
      "credential.helper=",
      "credential.helper=store --file='/tmp/nx/credentials'"
    ]);
  });
});

it("apps git-project clone clones the per-project remote", async () => {
  await run(["apps", "git-project", "clone", PROJECT_ID]);
  expect(gitCalls[0]?.argv.slice(-2)).toEqual([PROJECT_CREDENTIALS.cloneUrl, "shared-lib"]);
});

it("apps git-credentials <projectId> prints the per-project credential", async () => {
  const paths = await run(["apps", "git-credentials", PROJECT_ID]);
  expect(process.exitCode ?? 0).toBe(0);
  expect(paths).toEqual([PROJECT_ROUTE]);
});

it("apps git-credentials refuses to run without a project id", async () => {
  await expect(run(["apps", "git-credentials"])).rejects.toThrow(/projectId/);
  expect(tenantRequest).not.toHaveBeenCalled();
});

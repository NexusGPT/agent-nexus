import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

import { buildCloneArgs } from "./apps/git-local/build-clone-args";
import { buildPullArgs } from "./apps/git-local/build-pull-args";
import { composeCredentialLine } from "./apps/git-local/compose-credential-line";
import { resolveCloneDirectory } from "./apps/git-local/resolve-clone-directory";

// The apps commands reach the API through tenantRequest, not the SDK client;
// registration alone must not touch either.
vi.mock("../util/tenant-http", () => ({ tenantRequest: vi.fn() }));

import { registerAppsCommands } from "./apps";

const CREDENTIALS = {
  username: "vibe-p-0123",
  pushToken: "tok_live_abc123",
  cloneUrl: "https://git.acme.gpt.nexus/apps/shared-lib.git"
};

describe("composeCredentialLine", () => {
  it("scopes the credential to the git host so it is never offered elsewhere", () => {
    expect(composeCredentialLine(CREDENTIALS)).toBe(
      "https://vibe-p-0123:tok_live_abc123@git.acme.gpt.nexus\n"
    );
  });

  it("percent-encodes a token containing URL-significant characters", () => {
    const line = composeCredentialLine({
      ...CREDENTIALS,
      pushToken: "tok/with@weird:chars"
    });
    expect(line).toBe("https://vibe-p-0123:tok%2Fwith%40weird%3Achars@git.acme.gpt.nexus\n");
  });

  // The caller must surface this rather than clone unauthenticated, which
  // fails inside git with a far less actionable message.
  it("returns null when the clone URL is not a parseable URL", () => {
    expect(composeCredentialLine({ ...CREDENTIALS, cloneUrl: "not-a-url" })).toBeNull();
  });

  // The line is written as https, so an http remote would never be matched by
  // it and git would fall through to prompting — refuse it up front instead.
  it("returns null when the clone URL is not https", () => {
    expect(
      composeCredentialLine({ ...CREDENTIALS, cloneUrl: "http://git.acme.gpt.nexus/apps/x.git" })
    ).toBeNull();
  });
});

describe("resolveCloneDirectory", () => {
  it("defaults to the project name", () => {
    expect(resolveCloneDirectory(undefined, "shared-lib")).toBe("shared-lib");
  });

  it("prefers an explicit directory", () => {
    expect(resolveCloneDirectory("./vendor/lib", "shared-lib")).toBe("./vendor/lib");
  });

  it("treats a whitespace-only directory as absent", () => {
    expect(resolveCloneDirectory("   ", "shared-lib")).toBe("shared-lib");
  });
});

describe("buildCloneArgs", () => {
  const args = buildCloneArgs(
    "/tmp/nexus-vibe-git-x/credentials",
    "https://git.acme.gpt.nexus/apps/shared-lib.git",
    "shared-lib",
    "main"
  );

  // The reset is what keeps the token out of the macOS keychain: without it
  // the -c helper is APPENDED to osxkeychain and git stores into both.
  it("resets every configured helper, then points git at the throwaway file alone", () => {
    expect(args.slice(0, 5)).toEqual([
      "-c",
      "credential.helper=",
      "-c",
      "credential.helper=store --file='/tmp/nexus-vibe-git-x/credentials'",
      "clone"
    ]);
  });

  it("quotes a credential path containing spaces", () => {
    // os.tmpdir() on Windows is routinely C:\Users\First Last\AppData\...,
    // and git runs a helper value containing whitespace through a shell — so
    // an unquoted path is handed to the store helper truncated at the space
    // and the clone fails to authenticate with nothing pointing at the cause.
    const spaced = buildCloneArgs(
      "C:\\Users\\First Last\\AppData\\Local\\Temp\\nx\\credentials",
      "https://h/o/r.git",
      "r",
      undefined
    );

    expect(spaced[3]).toBe(
      "credential.helper=store --file='C:\\Users\\First Last\\AppData\\Local\\Temp\\nx\\credentials'"
    );
  });

  it("escapes a single quote in the credential path", () => {
    const quoted = buildCloneArgs("/tmp/o'brien/credentials", "https://h/o/r.git", "r", undefined);

    expect(quoted[3]).toBe(`credential.helper=store --file='/tmp/o'\\''brien/credentials'`);
  });

  it("checks out the requested branch", () => {
    expect(args).toContain("--branch");
    expect(args[args.indexOf("--branch") + 1]).toBe("main");
  });

  // `--` stops a URL or directory that begins with a dash being read as a flag.
  it("terminates options before the positional arguments", () => {
    expect(args.slice(-3)).toEqual([
      "--",
      "https://git.acme.gpt.nexus/apps/shared-lib.git",
      "shared-lib"
    ]);
  });

  it("omits --branch when no branch is known", () => {
    const noBranch = buildCloneArgs("/tmp/c", "https://h/o/r.git", "r", undefined);
    expect(noBranch).not.toContain("--branch");
  });

  // The whole point of the credential-file indirection: argv is readable by
  // any other user on the machine via `ps`.
  it("keeps the token out of argv entirely", () => {
    expect(args.join(" ")).not.toContain(CREDENTIALS.pushToken);
  });
});

describe("buildPullArgs", () => {
  const args = buildPullArgs("/tmp/nexus-vibe-git-y/credentials", "./shared-lib");

  it("runs inside the target directory", () => {
    expect(args.slice(0, 2)).toEqual(["-C", "./shared-lib"]);
  });

  it("refuses to create a merge commit behind the user's back", () => {
    expect(args.slice(-2)).toEqual(["pull", "--ff-only"]);
  });

  it("resets every configured helper before supplying a fresh credential", () => {
    expect(args.slice(2, 6)).toEqual([
      "-c",
      "credential.helper=",
      "-c",
      "credential.helper=store --file='/tmp/nexus-vibe-git-y/credentials'"
    ]);
  });
});

/**
 * Guards the wiring, not the logic: a helper can be perfect and still be
 * unreachable if the subcommand was never attached to the `git-project` group.
 */
describe("git-project command registration", () => {
  function gitProjectGroup(): Command {
    const program = new Command();
    program.name("nexus").option("--json", "Output as JSON");
    registerAppsCommands(program);
    const apps = program.commands.find((c) => c.name() === "apps");
    expect(apps).toBeDefined();
    const group = apps?.commands.find((c) => c.name() === "git-project");
    expect(group).toBeDefined();
    return group as Command;
  }

  it("exposes clone and pull alongside the pre-existing subcommands", () => {
    const names = gitProjectGroup()
      .commands.map((c) => c.name())
      .sort();
    expect(names).toEqual(
      ["clone", "create", "delete", "get", "list", "pull", "reprovision"].sort()
    );
  });

  it("takes an optional directory on both, so the project name can default it", () => {
    const group = gitProjectGroup();
    expect(group.commands.find((c) => c.name() === "clone")?.usage()).toContain(
      "<projectId> [directory]"
    );
    expect(group.commands.find((c) => c.name() === "pull")?.usage()).toContain(
      "<projectId> [directory]"
    );
  });

  it("offers --branch on clone only — pull follows whatever is checked out", () => {
    const group = gitProjectGroup();
    const cloneFlags = group.commands.find((c) => c.name() === "clone")?.options.map((o) => o.long);
    expect(cloneFlags).toContain("--branch");
    expect(
      group.commands.find((c) => c.name() === "pull")?.options.map((o) => o.long)
    ).not.toContain("--branch");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.fn<(file: string, args: readonly string[], options: unknown) => string>();
vi.mock("node:child_process", () => ({
  execFileSync: (file: string, args: readonly string[], options: unknown) =>
    execFileSync(file, args, options)
}));

const { RENEWAL_DRY_RUN_TIMEOUT_MS, renewalDryRunProblem } = await import("./renewal-dry-run");
const { system32Exe } = await import("../../../workspace-direct-mount/win32/win32-system-exe");

const RENEW_CMD = "C:\\Users\\José\\.nexus-mcp\\mount-credentials\\0123456789abcdef\\renew.cmd";
const ENV = { USERPROFILE: "C:\\Users\\José", AWS_PROFILE: "nexus-mount-0123456789abcdef" };
const DOCUMENT = JSON.stringify(
  {
    Version: 1,
    AccessKeyId: "ASIA_MINTED_KEY",
    SecretAccessKey: "SECRET_NEVER_SHOWN",
    SessionToken: "TOKEN_NEVER_SHOWN",
    Expiration: "2026-09-29T15:55:00.000Z"
  },
  null,
  2
);

beforeEach(() => execFileSync.mockReset());

describe("renewalDryRunProblem — renew.cmd run once, as the SDK will, before rclone starts", () => {
  it("runs System32's cmd.exe /C <renew.cmd> under the given environment, bounded, and accepts this drive's credentials", () => {
    execFileSync.mockReturnValue(`${DOCUMENT}\n`);
    expect(renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_MINTED_KEY")).toBeNull();
    // Never the bare name: Windows looks in the current folder before PATH.
    expect(system32Exe({}, "cmd.exe")).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(execFileSync).toHaveBeenCalledWith(
      system32Exe(process.env, "cmd.exe"),
      ["/C", RENEW_CMD],
      expect.objectContaining({ env: ENV, timeout: RENEWAL_DRY_RUN_TIMEOUT_MS })
    );
  });

  it("refuses output an AutoRun command printed before the document, naming its first line", () => {
    execFileSync.mockReturnValue(`Active code page: 65001\r\n${DOCUMENT}\n`);
    const problem = renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_MINTED_KEY");
    expect(problem).toContain('"Active code page: 65001"');
  });

  it("never quotes a first line that holds the document, which carries the secret — at its start or after a prefix", () => {
    const oneLine = JSON.stringify(JSON.parse(DOCUMENT));
    execFileSync.mockReturnValue(`${oneLine}\nextra\n`);
    const opens = renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_MINTED_KEY");
    expect(opens).toContain("a line that holds a JSON document beside other text");
    expect(opens).not.toContain("SECRET_NEVER_SHOWN");

    // An AutoRun that prints with no line end puts the document on its line.
    execFileSync.mockReturnValue(`banner ${oneLine}\n`);
    const prefixed = renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_MINTED_KEY");
    expect(prefixed).toContain("a line that holds a JSON document beside other text");
    expect(prefixed).not.toContain("SECRET_NEVER_SHOWN");
  });

  it("refuses a document for another key: that is not this drive's session", () => {
    execFileSync.mockReturnValue(DOCUMENT);
    expect(renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_OTHER_KEY")).toBe(
      "its output is a JSON document, but not this drive's credentials"
    );
  });

  it("names why cmd.exe could not run it: a missing program, or the helper's exit code", () => {
    execFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error("spawnSync cmd.exe ENOENT"), { code: "ENOENT" });
    });
    expect(renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_MINTED_KEY")).toBe(
      "cmd.exe could not run it (ENOENT)"
    );
    execFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error("Command failed"), { status: 9 });
    });
    expect(renewalDryRunProblem(RENEW_CMD, ENV, "ASIA_MINTED_KEY")).toBe(
      "cmd.exe could not run it (exit 9)"
    );
  });
});

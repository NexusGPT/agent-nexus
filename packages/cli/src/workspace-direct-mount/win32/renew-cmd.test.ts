import { describe, expect, it } from "vitest";

import { parseRenewCmd, renewCmdFor } from "./renew-cmd";

const input = {
  execPath: "C:\\Program Files\\nodejs\\node.exe",
  entry:
    "C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\node_modules\\@agent-nexus\\cli\\dist\\index.js",
  mountId: "0123456789abcdef"
};

describe("renewCmdFor — the batch file credential_process names on Windows", () => {
  it("is five CRLF lines: echo off, UTF-8 for the lines after (chcp by its System32 address), no delayed expansion, the quoted command, its exit code", () => {
    expect(renewCmdFor(input)).toBe(
      "@echo off\r\n" +
        '"%SystemRoot%\\System32\\chcp.com" 65001 >nul\r\n' +
        "setlocal DisableDelayedExpansion\r\n" +
        '"C:\\Program Files\\nodejs\\node.exe" ' +
        '"C:\\Users\\Jane Doe\\AppData\\Roaming\\npm\\node_modules\\@agent-nexus\\cli\\dist\\index.js" ' +
        "workspace credential-process 0123456789abcdef\r\n" +
        "exit /b %ERRORLEVEL%\r\n"
    );
  });
});

describe("parseRenewCmd — reads back only the text renewCmdFor writes", () => {
  it("round-trips the node path, the CLI entry and the mount id", () => {
    expect(parseRenewCmd(renewCmdFor(input))).toEqual(input);
  });

  const good = renewCmdFor(input);
  it.each([
    ["LF line ends", good.split("\r\n").join("\n")],
    ["no @echo off", good.replace("@echo off\r\n", "")],
    ["delayed expansion left on", good.replace("setlocal DisableDelayedExpansion\r\n", "")],
    ["no exit line", good.replace("exit /b %ERRORLEVEL%\r\n", "")],
    ["a line after the exit", `${good}echo done\r\n`],
    ["an upper-case mount id", renewCmdFor({ ...input, mountId: "0123456789ABCDEF" })],
    ["a 15-digit mount id", renewCmdFor({ ...input, mountId: "0123456789abcde" })],
    ["an unquoted node path", good.replace(`"${input.execPath}"`, input.execPath)],
    ["an empty file", ""]
  ])("is null for %s", (_label, text) => {
    // Each text differs from `good` by the one change its label names.
    expect(text).not.toBe(good);
    expect(parseRenewCmd(text)).toBeNull();
  });
});

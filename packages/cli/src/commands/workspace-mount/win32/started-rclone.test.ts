import fs from "node:fs";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { START_ENV, START_SCRIPT } from "./start-rclone-hidden";
import { isStartScript, leaveStarted, startedRclone, windowsArgvOf } from "./started-rclone";
import { powerShellArgv } from "./win32-powershell";
import { windowsArgvLine } from "./windows-argv-line";

const SANDBOX = path.join(process.env.TMPDIR ?? "/tmp", `nexus-started-rclone-${process.pid}`);
const LOG = path.join(SANDBOX, "gc.log");
const RESULT = `${LOG}.1.start`;
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
/** The env the start is given: rclone's own, plus the five values the script reads. */
const ENV = {
  AWS_CONFIG_FILE: "C:\\aws.config",
  [START_ENV.exe]: "C:\\Users\\me\\.nexus-mcp\\bin\\rclone.exe",
  [START_ENV.args]: windowsArgvLine([
    "mount",
    "nxws:",
    "X:",
    "--volname",
    "General Context (Acme’s)"
  ]),
  [START_ENV.cwd]: "C:\\Users\\me\\.nexus-mcp\\logs",
  [START_ENV.log]: LOG,
  [START_ENV.result]: RESULT
};

beforeEach(() => {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
  fs.mkdirSync(SANDBOX, { recursive: true });
});
afterAll(() => fs.rmSync(SANDBOX, { recursive: true, force: true }));

describe("windowsArgvOf — reads back what windowsArgvLine wrote", () => {
  it.each([
    [["mount", "nxws:", "C:\\Users\\me\\nexus\\acme\\ws"]],
    [
      [
        "--volname",
        "General Context (Acme)",
        "--cache-dir",
        "C:\\Users\\Jo Blo\\.nexus-mcp\\cache\\ab"
      ]
    ],
    [['say "hi"', 'back\\\\"slash', "trail\\ ends\\", "", "tab\there", "plain"]],
    [["C:\\Users\\O'Neil\\x", "X:", "Acme’s"]]
  ])("%j survives the round trip", (argv) => {
    expect(windowsArgvOf(windowsArgvLine(argv))).toEqual(argv);
  });

  it("reads a line written by hand the way cmd.exe would", () => {
    expect(windowsArgvOf('a  "b c"\td "e\\"f" ""')).toEqual(["a", "b c", "d", 'e"f', ""]);
  });
});

describe("isStartScript / leaveStarted / startedRclone — the fake's three moves", () => {
  it("recognises the start script fourth in PowerShell's argv, and nothing else", () => {
    expect(isStartScript([...powerShellArgv(START_SCRIPT)])).toBe(true);
    expect(isStartScript([...powerShellArgv("Get-CimInstance Win32_Process")])).toBe(false);
    expect(isStartScript(undefined)).toBe(false);
  });

  it("leaves the log rewritten with the staged lines and the result line: a pid, or the code rclone ended with", () => {
    fs.writeFileSync(LOG, "an earlier run's line\n");
    leaveStarted(ENV, { pid: 4242, log: ["panic: cgofuse: cannot find winfsp", "trace"] });
    expect(fs.readFileSync(LOG, "utf-8")).toBe("panic: cgofuse: cannot find winfsp\ntrace\n");
    expect(fs.readFileSync(RESULT, "utf-8")).toBe("pid 4242\r\n");
    leaveStarted(ENV, { exited: 2, log: [] });
    expect(fs.readFileSync(LOG, "utf-8")).toBe("");
    expect(fs.readFileSync(RESULT, "utf-8")).toBe("exited 2\r\n");
  });

  it("reads exe, argv, cwd and the env rclone inherits back out of the one start run, and null when there was none", () => {
    const calls = [
      [POWERSHELL, [...powerShellArgv("Get-CimInstance Win32_Process")], { env: ENV }],
      [POWERSHELL, [...powerShellArgv(START_SCRIPT)], { env: ENV }]
    ];
    expect(startedRclone(calls, POWERSHELL)).toEqual({
      exe: "C:\\Users\\me\\.nexus-mcp\\bin\\rclone.exe",
      argv: ["mount", "nxws:", "X:", "--volname", "General Context (Acme’s)"],
      // The five start variables are gone: PowerShell removes them before rclone starts.
      env: { AWS_CONFIG_FILE: "C:\\aws.config" },
      cwd: "C:\\Users\\me\\.nexus-mcp\\logs"
    });
    expect(startedRclone([calls[0] ?? []], POWERSHELL)).toBeNull();
    expect(() => startedRclone([calls[1] ?? [], calls[1] ?? []], POWERSHELL)).toThrow(
      "2 start runs"
    );
  });
});

import { describe, expect, it } from "vitest";

import { classifyWin32MountPoint, insideOneDrive } from "./win32-mount-point";

describe("classifyWin32MountPoint — what a Windows --at names, before the disk is touched", () => {
  it.each([
    ["X:", "X:"],
    ["x:", "X:"],
    ["Z:\\", "Z:"]
  ])("%s is the drive %s", (at, letter) => {
    expect(classifyWin32MountPoint(at)).toEqual({ kind: "drive", letter });
  });

  it.each(["C:\\Users\\jo\\nexus\\acme\\docs", "ws", ".\\ws", "D:\\drives\\docs"])(
    "%s is a folder, left to the caller's path.resolve",
    (at) => {
      expect(classifyWin32MountPoint(at)).toEqual({ kind: "folder" });
    }
  );

  it.each([
    ["*", "Name the letter: --at X:"],
    ['C:\\my ws\\" --read-only', "trailing backslash"],
    ["\\\\server\\share\\docs", "local folder or a drive letter"],
    ["//server/share/docs", "local folder or a drive letter"],
    ["\\/server/share/docs", "local folder or a drive letter"],
    ["/\\server\\share\\docs", "local folder or a drive letter"],
    ["C:\\nexus\\con", "Pick another folder name"],
    ["C:\\nexus\\NUL.txt", "Pick another folder name"],
    ["C:\\nexus\\com1", "Pick another folder name"],
    ["C:\\nexus\\COM¹", "Pick another folder name"],
    ["C:\\nexus\\lpt³.log", "Pick another folder name"],
    ["C:\\nexus\\docs.", "Pick another folder name"],
    ["C:\\nexus\\docs ", "Pick another folder name"]
  ])("%s is refused, naming the way out", (at, hint) => {
    const verdict = classifyWin32MountPoint(at);
    expect(verdict.kind).toBe("refused");
    if (verdict.kind !== "refused") return;
    expect(verdict.hint).toContain(hint);
  });

  it("a name that merely starts with a device name is a folder: `console`, `auxiliary`", () => {
    expect(classifyWin32MountPoint("C:\\nexus\\console")).toEqual({ kind: "folder" });
    expect(classifyWin32MountPoint("C:\\nexus\\auxiliary")).toEqual({ kind: "folder" });
  });
});

describe("insideOneDrive — a folder OneDrive would try to sync", () => {
  const env = {
    OneDrive: "C:\\Users\\jo\\OneDrive",
    OneDriveCommercial: "C:\\Users\\jo\\OneDrive - Acme\\",
    PATH: "C:\\Windows"
  };

  it("names the root for a folder inside either OneDrive, whatever the case", () => {
    expect(insideOneDrive("c:\\users\\jo\\onedrive\\nexus\\docs", env)).toBe(
      "C:\\Users\\jo\\OneDrive"
    );
    expect(insideOneDrive("C:\\Users\\jo\\OneDrive - Acme\\docs", env)).toBe(
      "C:\\Users\\jo\\OneDrive - Acme\\"
    );
  });

  it("answers null outside it, and for a sibling that only shares the prefix", () => {
    expect(insideOneDrive("C:\\Users\\jo\\nexus\\acme\\docs", env)).toBeNull();
    expect(insideOneDrive("C:\\Users\\jo\\OneDriveBackup\\docs", env)).toBeNull();
    expect(insideOneDrive("C:\\Users\\jo\\OneDrive\\docs", {})).toBeNull();
  });
});

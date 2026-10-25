import { describe, expect, it } from "vitest";

import { win32InstallerEnvFor } from "./win32-installer-env";

describe("win32InstallerEnvFor — the allow-list, spelled the way Windows spells it", () => {
  it("keeps the POSIX names whatever their case, plus the Windows names, and nothing else", () => {
    const env = win32InstallerEnvFor({
      Path: "C:\\Windows\\System32",
      TEMP: "C:\\Users\\jo\\AppData\\Local\\Temp",
      TMP: "C:\\Users\\jo\\AppData\\Local\\Temp",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      SESSIONNAME: "Console",
      HTTPS_PROXY: "http://proxy.corp:3128",
      NEXUS_API_KEY: "nxs_secret",
      AWS_SECRET_ACCESS_KEY: "aws-secret",
      NEXUS_ADMIN_TOKEN: "admin-secret"
    });
    expect(env).toEqual({
      Path: "C:\\Windows\\System32",
      TMP: "C:\\Users\\jo\\AppData\\Local\\Temp",
      ComSpec: "C:\\Windows\\System32\\cmd.exe",
      PATHEXT: ".COM;.EXE;.BAT;.CMD",
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      SESSIONNAME: "Console",
      HTTPS_PROXY: "http://proxy.corp:3128"
    });
  });

  it("adds no brew setting: there is no brew on Windows", () => {
    expect(win32InstallerEnvFor({})).toEqual({});
  });
});

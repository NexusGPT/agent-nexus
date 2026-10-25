import { describe, expect, it } from "vitest";

import {
  explorerRunsLower,
  HIGH_INTEGRITY_SID,
  isHighIntegrity,
  sessionHasExplorer,
  UAC_POLICY_SCRIPT,
  WHOAMI_GROUPS
} from "./win32-elevated";

const policy = (
  enableLua: string,
  filterAdmin: string,
  user: string,
  account = "DESKTOP-1\\Administrator",
  explorer = account
): string =>
  `EnableLUA=${enableLua}\r\nFilterAdministratorToken=${filterAdmin}\r\nUser=${user}\r\n` +
  `Account=${account}\r\nComputer=DESKTOP-1\r\nExplorer=${explorer}\r\n`;
const NORMAL_SID = "S-1-5-21-1111-2222-3333-1001";
const BUILT_IN_ADMIN_SID = "S-1-5-21-1111-2222-3333-500";
const DOMAIN_ADMIN_SID = "S-1-5-21-4444-5555-6666-500";

describe("sessionHasExplorer — a session with no Explorer at all is told so, not sent to a terminal it cannot open", () => {
  it("is false only for an explicit empty owner; a desktop user, a missing line and an unreadable policy all read as a desktop", () => {
    expect(sessionHasExplorer(policy("0", "", NORMAL_SID, "DESKTOP-1\\jo", "\\"))).toBe(false);
    expect(sessionHasExplorer(policy("1", "", NORMAL_SID, "DESKTOP-1\\jo", "DESKTOP-1\\jo"))).toBe(
      true
    );
    expect(sessionHasExplorer("EnableLUA=1\r\n")).toBe(true);
    expect(sessionHasExplorer(null)).toBe(true);
    // A WMI that failed prints `?` (the script's catch), which reads as a desktop, never as none.
    expect(sessionHasExplorer(policy("0", "", NORMAL_SID, "DESKTOP-1\\jo", "?"))).toBe(true);
    expect(UAC_POLICY_SCRIPT).toMatch(/-ErrorAction Stop.*catch \{ "Explorer=\?" \}$/);
  });
});

describe("explorerRunsLower — an elevated terminal is refused only when Explorer runs at a lower integrity", () => {
  it("reads UAC on, for a user Admin Approval Mode filters, as Explorer running lower", () => {
    expect(explorerRunsLower(policy("1", "", NORMAL_SID))).toBe(true);
    expect(explorerRunsLower(policy("1", "1", BUILT_IN_ADMIN_SID))).toBe(true);
  });

  it("reads UAC off, or the unfiltered built-in Administrator, as Explorer elevated too", () => {
    expect(explorerRunsLower(policy("0", "", NORMAL_SID))).toBe(false);
    expect(explorerRunsLower(policy("1", "", BUILT_IN_ADMIN_SID))).toBe(false);
    expect(explorerRunsLower(policy("1", "0", BUILT_IN_ADMIN_SID))).toBe(false);
    expect(explorerRunsLower(policy("1", "", BUILT_IN_ADMIN_SID, "desktop-1\\Admin"))).toBe(false);
  });

  it("reads a terminal run as ANOTHER account than Explorer's (runas) as Explorer running lower: the drive lands in a session Explorer cannot see", () => {
    const desktopUser = "DESKTOP-1\\jo";
    expect(
      explorerRunsLower(
        policy("1", "", BUILT_IN_ADMIN_SID, "DESKTOP-1\\Administrator", desktopUser)
      )
    ).toBe(true);
    expect(explorerRunsLower(policy("0", "", NORMAL_SID, "DESKTOP-1\\it-admin", desktopUser))).toBe(
      true
    );
    // No Explorer in the session (a service, SSH): nothing shows Explorer shares the account.
    expect(explorerRunsLower(policy("0", "", NORMAL_SID, "DESKTOP-1\\jo", "\\"))).toBe(true);
  });

  it("reads a DOMAIN account with relative id 500 as filtered: Admin Approval Mode exempts only the local one", () => {
    expect(explorerRunsLower(policy("1", "", DOMAIN_ADMIN_SID, "CORP\\Administrator"))).toBe(true);
    expect(explorerRunsLower(policy("1", "", DOMAIN_ADMIN_SID, ""))).toBe(true);
  });

  it("reads a policy it could not read, or an unreadable value, as Explorer running lower — the refusal stays", () => {
    expect(explorerRunsLower(null)).toBe(true);
    expect(explorerRunsLower("")).toBe(true);
    expect(explorerRunsLower(policy("", "", ""))).toBe(true);
    expect(explorerRunsLower(policy("", "", BUILT_IN_ADMIN_SID))).toBe(true);
    expect(explorerRunsLower(policy("0x0", "", NORMAL_SID))).toBe(true);
  });

  it("reads all six values in one script", () => {
    expect(UAC_POLICY_SCRIPT).toContain('"Explorer=$($o.Domain)\\$($o.User)"');
    expect(UAC_POLICY_SCRIPT).toContain("-MethodName GetOwner");
    expect(UAC_POLICY_SCRIPT).toContain("EnableLUA");
    expect(UAC_POLICY_SCRIPT).toContain("FilterAdministratorToken");
    expect(UAC_POLICY_SCRIPT).toContain(
      "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value"
    );
    expect(UAC_POLICY_SCRIPT).toContain(
      '"Account=$([Security.Principal.WindowsIdentity]::GetCurrent().Name)"'
    );
    expect(UAC_POLICY_SCRIPT).toContain('"Computer=$env:COMPUTERNAME"');
  });
});

const NORMAL =
  "GROUP INFORMATION\r\n\r\nGroup Name  Type  SID  Attributes\r\n" +
  "Mandatory Label\\Medium Mandatory Level  Label  S-1-16-8192\r\n";
const ELEVATED =
  "GROUP INFORMATION\r\n\r\nGroup Name  Type  SID  Attributes\r\n" +
  `Mandatory Label\\High Mandatory Level  Label  ${HIGH_INTEGRITY_SID}\r\n`;

describe("isHighIntegrity — the elevated token by its label SID", () => {
  it("reads the high-integrity label as elevated, and the medium one as not", () => {
    expect(isHighIntegrity(ELEVATED)).toBe(true);
    expect(isHighIntegrity(NORMAL)).toBe(false);
  });

  it("reads nothing at all as not elevated — a probe that printed nothing must not lock a user out", () => {
    expect(isHighIntegrity("")).toBe(false);
  });

  it("probes whoami's group list and nothing else", () => {
    expect(WHOAMI_GROUPS).toEqual({ file: "whoami.exe", args: ["/groups"] });
  });
});

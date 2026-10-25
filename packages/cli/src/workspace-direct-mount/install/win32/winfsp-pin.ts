/**
 * WinFsp, the Windows file-system driver rclone mounts through, pinned by
 * version AND by the sha256 of the vendor's signed MSI. Taken from the GitHub
 * release asset digest for v2.1 on 2026-09-28 and checked against the MSI
 * downloaded and hashed that day (2,191,360 bytes): both matched.
 *
 * One road only: this MSI, run through `msiexec` behind the UAC prompt. No
 * winget — it is absent on Server and LTSC, and it would not verify this pin.
 *
 * To bump: change the version, read the new asset's digest from the release,
 * download the MSI and hash it to confirm. Never copy a hash from a chat.
 */
export const WINFSP_PIN = {
  version: "2.1.25156",
  sha256: "073a70e00f77423e34bed98b86e600def93393ba5822204fac57a29324db9f7a"
} as const;

export function winFspMsiName(): string {
  return `winfsp-${WINFSP_PIN.version}.msi`;
}

export function winFspMsiUrl(): string {
  return `https://github.com/winfsp/winfsp/releases/download/v2.1/${winFspMsiName()}`;
}

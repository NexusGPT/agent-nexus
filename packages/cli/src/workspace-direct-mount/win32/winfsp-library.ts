import path from "node:path";

/**
 * The DLL rclone's loader (cgofuse) opens on Windows, under WinFsp's install
 * directory, one per CPU architecture. Built with `path.win32` on purpose:
 * Node's `path` binds to the HOST at load, so a spec pretending win32 on a Mac
 * would otherwise join with `/`.
 */
const WINFSP_ARCHES = ["x64", "arm64", "ia32"] as const;
export type WinFspArch = (typeof WINFSP_ARCHES)[number];

export function isWinFspArch(arch: NodeJS.Architecture): arch is WinFspArch {
  return (WINFSP_ARCHES as readonly string[]).includes(arch);
}

const WINFSP_DLL_FOR = {
  x64: "winfsp-x64.dll",
  arm64: "winfsp-a64.dll",
  ia32: "winfsp-x86.dll"
} as const satisfies Record<WinFspArch, string>;

export function winFspLibraryFor(installDir: string, arch: WinFspArch): string {
  return path.win32.join(installDir, "bin", WINFSP_DLL_FOR[arch]);
}

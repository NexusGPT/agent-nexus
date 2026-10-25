import path from "node:path";

/**
 * The full address of a program Windows ships in System32. Called instead of
 * the bare name, which two places can answer with a same-named impostor.
 * PATH: under Git Bash, Git's `usr\bin` comes before System32, so `tar` is
 * GNU tar (it cannot read a zip) and `whoami` is coreutils (it has no
 * `/groups`). And the current folder: Node on Windows looks there BEFORE PATH
 * for a name with no directory part, and the folder a drive is mounted from —
 * a cloned repository, the mounted drive itself — is one other people write
 * to. Built with `path.win32` because Node's `path` binds to the host at load.
 */
export function system32Exe(env: NodeJS.ProcessEnv, exe: string): string {
  // `||`, not `??`: an EMPTY SystemRoot would yield the relative `System32\…`,
  // which Windows resolves against the working folder — the lookup this exists to avoid.
  const address = path.win32.join(env.SystemRoot || "C:\\Windows", "System32", exe);
  if (!path.win32.isAbsolute(address)) throw new Error(`not an absolute address: ${address}`);
  return address;
}

/** Windows PowerShell's fixed home, one folder below System32: the same rule as {@link system32Exe}. */
export function powerShellExe(env: NodeJS.ProcessEnv): string {
  return system32Exe(env, path.win32.join("WindowsPowerShell", "v1.0", "powershell.exe"));
}

import { exec } from "node:child_process";

/**
 * Hand a URL to whatever this platform uses to open one.
 *
 * FIRE AND FORGET BY DESIGN: `exec` is not awaited and its failure is not
 * reported, because every caller has already printed the URL and the open is a
 * convenience on top of that. A headless box with no handler simply does
 * nothing, which is the correct outcome — the operator still has the link.
 *
 * ONE copy for this package: the auth tree and `commands/channel.ts` each
 * carried a byte-identical private one until they were pointed here.
 *
 * ⚠️ A THIRD COPY LIVES OUTSIDE THIS PACKAGE, in
 * `packages/mcp-server/src/commands/login.ts`, alongside its own duplicate of
 * the settings URL literal. It is NOT deduped against this file: `@agent-nexus/
 * mcp-server` does not depend on the CLI, so sharing this needs a dependency
 * edge or a third home, which is a packaging decision rather than a tidy-up. A
 * platform that needs a different command still has to be taught twice.
 */
export function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  exec(`${cmd} ${JSON.stringify(url)}`);
}

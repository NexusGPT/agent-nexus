import { afterEach, beforeEach } from "vitest";

/**
 * SPEC SUPPORT. This file imports vitest, so nothing that ships may import it:
 * tsup bundles from `index.ts` and never reaches it; tsconfig typechecks it.
 */

/** The platform this process really runs on, captured before any case stages another. */
const HOST_PLATFORM: NodeJS.Platform = process.platform;
const HOST_DESCRIPTOR = Object.getOwnPropertyDescriptor(process, "platform");

/** The host's own platform, however a case has staged `process.platform` since. */
export function hostPlatform(): NodeJS.Platform {
  return HOST_PLATFORM;
}

/**
 * Why `host` cannot run a case that stages `staged`, or null when it can. On
 * Windows `path` is the win32 one and every real path carries `\`, so a macOS
 * or Linux row would meet paths it never meets in the field.
 */
export function hostRefusesStage(host: NodeJS.Platform, staged: NodeJS.Platform): string | null {
  if (host === "win32" && staged !== "win32") return `stages ${staged}; this host is Windows`;
  return null;
}

/**
 * Stage `process.platform` for the running case and put the host's own back
 * after it; a case the host cannot run (see {@link hostRefusesStage}) skips
 * itself. Call once at a spec's top level — the hooks it needs are registered
 * from the call — and stage from inside a case with the function it returns.
 */
export function stagePlatform(): (platform: NodeJS.Platform) => void {
  if (!HOST_DESCRIPTOR) throw new Error("process.platform has no descriptor to restore");
  const host = HOST_DESCRIPTOR;
  // Only a case's own context can skip it, so each case hands its `skip` over.
  let skipThisCase: (note: string) => never = () => {
    throw new Error("pretendPlatform ran outside a case");
  };
  beforeEach(({ skip }) => {
    skipThisCase = skip;
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", host);
  });
  return (platform) => {
    const refusal = hostRefusesStage(HOST_PLATFORM, platform);
    if (refusal !== null) skipThisCase(refusal);
    Object.defineProperty(process, "platform", { ...host, value: platform });
  };
}

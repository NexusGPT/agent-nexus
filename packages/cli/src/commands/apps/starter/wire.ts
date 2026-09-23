/**
 * The app-starter route and the headers it echoes the resolved versions in.
 *
 * Declared here rather than imported from `@nexus/types`: the CLI is published
 * standalone and cannot reach that package at runtime.
 * `src/app-starter-wire.conformance.ts` is the compile-time gate that pins each
 * of these to the literal the contract declares, so a rename cannot silently
 * turn a version into "?" in the success line.
 */
export const APP_STARTER_PATH = "/api/vibe/app-starter" as const;
export const APP_STARTER_VERSION_HEADER = "x-nexus-apps-starter-version" as const;
export const APP_STARTER_UI_VERSION_HEADER = "x-nexus-apps-ui-version" as const;

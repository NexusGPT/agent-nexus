/**
 * THE DRIFT GATE'S DATA for `commands/workspace-remote-path.ts`, which
 * restates the server's workspace-path rules so `push` can refuse a bad name
 * before a request. The CLI binary cannot import `@nexus/types`
 * (`wire-types-bundle.test.ts`: a conformance module and nothing else), so the
 * real schema is read here, where `src/index.ts` cannot reach, and
 * `commands/workspace-remote-path.test.ts` runs both over one table.
 */
import { workspaceFilePathSchema } from "@nexus/types";

/** The schema's own first refusal for a path, or `null` when it accepts. */
export function schemaPathRefusal(path: string): string | null {
  const parsed = workspaceFilePathSchema.safeParse(path);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? "refused");
}

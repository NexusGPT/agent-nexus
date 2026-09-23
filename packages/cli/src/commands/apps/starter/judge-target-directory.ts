import { existsSync, readdirSync, statSync } from "node:fs";

export type TargetDirectoryVerdict = { ok: true; create: boolean } | { ok: false; reason: string };

/**
 * Whether `dir` may receive the starter. A missing directory is created; an
 * EMPTY one is used; anything else is refused, so the extraction can never
 * overwrite a file the user already has.
 */
export function judgeTargetDirectory(dir: string): TargetDirectoryVerdict {
  if (!existsSync(dir)) return { ok: true, create: true };
  if (!statSync(dir).isDirectory()) {
    return { ok: false, reason: `${dir} exists and is not a directory.` };
  }
  if (readdirSync(dir).length > 0) {
    return { ok: false, reason: `${dir} is not empty — refusing to extract over existing files.` };
  }
  return { ok: true, create: false };
}

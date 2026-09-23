import fs from "node:fs";

/**
 * A file whose first two bytes are `#!` is a script somebody is meant to run.
 *
 * That is the property that matters, and it is the only one of the three
 * candidates that is right in both directions here. Measured against the pinned
 * skills-nexus tree, over the 486 bundled files:
 *
 * - **By extension** — there is no allowlist that works. Of 59 bundled `.ts`
 *   files, 52 carry `#!/usr/bin/env npx tsx` and are documented as direct
 *   invocations, while 7 are library modules an example imports; `.js` is one
 *   file and it is a template with no shebang. An extension list would either
 *   miss 52 runners or mark 8 non-scripts executable. It is also the same
 *   weaker-second-source that `bundle-skills.ts` just deleted from the
 *   collection side — reintroducing one here restores that defect at the other
 *   end of the same pipe.
 * - **By the source file's mode** — the upstream repo marks only 19 of its 512
 *   blobs `100755`, so **63 of the 82 bundled shebang scripts are `100644`
 *   upstream**, including every `examples/*.ts` runner and 7 of the 14 hooks.
 *   Carrying the mode would ship those non-executable, and would REGRESS the
 *   hooks that install executable today.
 *
 * No bundled file is executable upstream without also carrying a shebang, so
 * the shebang rule loses nothing the mode would have caught.
 */
const SHEBANG = Buffer.from("#!");

export function hasShebang(content: Buffer): boolean {
  return content.subarray(0, SHEBANG.length).equals(SHEBANG);
}

/**
 * Grant execute exactly where read is already granted — `chmod +x` semantics,
 * not a blanket `0o755`. A file the user keeps at `0600` becomes `0700` rather
 * than being widened to world-readable.
 *
 * Best-effort: a chmod failure on an exotic filesystem must not abort an
 * otherwise-successful install.
 */
export function grantExecute(fullPath: string): void {
  try {
    const mode = fs.statSync(fullPath).mode & 0o7777;
    const next = mode | ((mode & 0o444) >> 2);
    if (next !== mode) fs.chmodSync(fullPath, next);
  } catch {
    /* best-effort: leave the file non-executable rather than fail install */
  }
}

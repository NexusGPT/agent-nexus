import fs from "node:fs";
import path from "node:path";

import { grantExecute, hasShebang } from "./skills-install.grant-execute";
import type { InstallLedger } from "./skills-install.ledger";
import { ledgerKey, sha256 } from "./skills-install.ledger-entry";
import { safeResolveWithinBase } from "./skills-install.safe-resolve-within-base";

export interface WriteResult {
  created: string[];
  updated: string[];
  skipped: string[];
  /**
   * On disk, DIFFERENT from the bundle, and not recognisable as something this
   * CLI wrote. Left exactly as it was; `--force` is the only way past it.
   */
  preserved: string[];
}

export interface WriteOpts {
  /**
   * Required, not optional: an install that forgets to thread the ledger is the
   * defect this whole mechanism exists to remove, and an optional parameter
   * makes forgetting the default.
   */
  ledger: InstallLedger;
  /** Overwrite a file this CLI does not recognise. */
  force?: boolean;
}

export function writeSkillFiles(
  basePath: string,
  files: { path: string; content: Buffer }[],
  opts: WriteOpts
): WriteResult {
  const result: WriteResult = { created: [], updated: [], skipped: [], preserved: [] };
  const { ledger } = opts;

  for (const file of files) {
    const fullPath = safeResolveWithinBase(basePath, file.path);
    if (!fullPath) {
      throw new Error(
        `Refusing to write unsafe path "${file.path}" — the skills bundle contains an entry that escapes the target directory.`
      );
    }
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });

    // Use lstat (not existsSync) so we detect symlinks BEFORE we follow them.
    // existsSync follows symlinks and returns false for dangling links, which
    // would let writeFileSync then create a file at the symlink's target —
    // possibly outside basePath.
    let existingStat: fs.Stats | null = null;
    try {
      existingStat = fs.lstatSync(fullPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== "ENOENT") throw err;
    }

    const key = ledgerKey(ledger, fullPath);

    if (existingStat) {
      if (!existingStat.isFile()) {
        throw new Error(
          `Refusing to overwrite "${fullPath}" — not a regular file (symlink or directory).`
        );
      }
      const existing = fs.readFileSync(fullPath);
      if (existing.equals(file.content)) {
        // Already the bundle's bytes. Record it, so a tree installed before the
        // ledger existed stops being unrecognised one file at a time.
        ledger.next[key] = sha256(file.content);
        result.skipped.push(file.path);
      } else {
        // `next` first: a file written earlier in THIS install is ours even
        // though the on-disk manifest predates it.
        const recorded = ledger.next[key] ?? ledger.previous[key];
        const isOurs = recorded !== undefined && recorded === sha256(existing);
        if (!isOurs && !opts.force) {
          result.preserved.push(file.path);
          continue;
        }
        fs.writeFileSync(fullPath, file.content);
        ledger.next[key] = sha256(file.content);
        result.updated.push(file.path);
      }
    } else {
      fs.writeFileSync(fullPath, file.content);
      ledger.next[key] = sha256(file.content);
      result.created.push(file.path);
    }

    // Deliberately outside the create/update/skip branches. Anyone who ran an
    // install before this shipped has these scripts on disk with byte-identical
    // content at mode 0644, so `skipped` is the exact path their repair travels
    // — a chmod reachable only from `created`/`updated` would never fix them.
    // A PRESERVED file is skipped by the `continue` above: it is the user's file
    // now, and its mode is theirs to choose.
    if (hasShebang(file.content)) grantExecute(fullPath);
  }

  return result;
}

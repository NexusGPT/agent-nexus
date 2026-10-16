import fs from "node:fs";
import path from "node:path";

import { ensureSecretDir } from "./secret-file";
import { REFRESH_LOCK_TTL_MS } from "./version-check.constants";

/**
 * Claim the right to refresh the cache. True means THIS invocation owns it.
 *
 * ── WHY A LOCK AT ALL ───────────────────────────────────────────────────────
 *
 * The refresh runs in a detached child (see `scheduleCacheRefresh`), so
 * nothing serialises it any more. Twenty parallel `nexus` invocations against
 * one expired cache would otherwise be twenty node processes and twenty writers
 * of one file. The write itself is made atomic separately, by rename; this stops
 * the twenty PROCESSES, which is the cost the atomic write cannot address.
 *
 * ── WHY A DIRECTORY AND NOT A FILE ──────────────────────────────────────────
 *
 * `mkdir` is create-or-fail in ONE syscall, on POSIX and on NFS alike, with no
 * flag to get wrong. `open(O_EXCL)` is the usual alternative and is documented
 * as unreliable over older NFS, which a corporate home directory can still be.
 *
 * 🚨 `recursive: true` DEFEATS THIS ENTIRELY — it succeeds on an existing
 * directory instead of throwing `EEXIST`, so every racer would "win". The parent
 * directory is created separately, above, precisely so this call can stay
 * non-recursive.
 *
 * ── THE CEILING, STATED ─────────────────────────────────────────────────────
 *
 * The takeover path (a lock older than {@link REFRESH_LOCK_TTL_MS}, left by a
 * killed refresher) is NOT exclusive: two invocations can both remove and
 * recreate it and both proceed. The cost is one extra detached child, in a
 * window that opens only after a crash, so it is not worth a second lock to
 * close. The common path — a live holder — is exclusive, and that is the path
 * that runs twenty times at once.
 */
export function acquireRefreshLock(lockDir: string): boolean {
  try {
    // `~/.nexus-mcp` holds the plaintext API key, so its mode is the helper's
    // business and not this function's — creating it here with a create-only
    // `mode:` is the exact shape `secret-file.ts` exists to keep out of the tree.
    ensureSecretDir(path.dirname(lockDir));
  } catch {
    // The parent may already exist, or be unwritable — the mkdir below decides.
  }
  try {
    // No mode of its own: an empty lock directory holds nothing, and it inherits
    // the 0700 the line above asserts on its parent.
    fs.mkdirSync(lockDir);
    return true;
  } catch {
    try {
      if (Date.now() - fs.statSync(lockDir).mtimeMs < REFRESH_LOCK_TTL_MS) return false;
      fs.rmdirSync(lockDir);
      fs.mkdirSync(lockDir);
      return true;
    } catch {
      return false;
    }
  }
}

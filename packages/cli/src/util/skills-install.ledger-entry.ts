import { createHash } from "node:crypto";
import path from "node:path";

import type { InstallLedger } from "./skills-install.ledger";

/** How one written file is ADDRESSED in the manifest. */
export function ledgerKey(ledger: InstallLedger, fullPath: string): string {
  const rel = path.relative(ledger.claudeDir, fullPath);
  // A write base outside the .claude dir has no stable relative key; the
  // absolute path is still deterministic and still only ever matches itself.
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return fullPath;
  return rel.split(path.sep).join("/");
}

/** How one written file is FINGERPRINTED in the manifest. */
export function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

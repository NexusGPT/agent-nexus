import type { createClient } from "../../../client";

/** Where a pull reads from and writes to, resolved once in `runPull`. */
export interface PullTarget {
  client: ReturnType<typeof createClient>;
  slug: string;
  folder: string;
  out: string;
  workspaceId: string | undefined;
}

import type { Engine } from "../../../mount-registry";
import type { DirectMountHealth } from "../../../workspace-direct-mount/direct-mount-health";
import type { RefreshJson } from "../../../workspace-direct-mount/refresh-json";
import type { JsonPendingUploads } from "../../workspace-mount/json-pending-uploads";

/** One registry row, projected for `--json` and rendered for the table. */
export interface StatusRow {
  readonly json: {
    readonly slug: string;
    readonly engine: Engine;
    readonly kind: "shared" | "org";
    readonly mode: "ro" | "rw" | null;
    readonly orgId: string | null;
    readonly orgName: string | null;
    readonly profile: string | null;
    readonly mountPath: string;
    readonly mountId: string | null;
    readonly expiresAt: string | null;
    readonly refresh: RefreshJson | null;
    /** A count, `"unknown"` for a cache present and unreadable, `null` where no cache is counted. */
    readonly pendingUploads: JsonPendingUploads;
    readonly live: "yes" | "no";
    readonly mountedAt: string;
  };
  readonly table: {
    readonly slug: string;
    readonly org: string;
    readonly profile: string;
    readonly mode: string;
    readonly engine: Engine;
    readonly kind: "shared" | "org";
    readonly mountPath: string;
    /** `yes` / `no`, or `yes` with who else holds it — the JSON keeps the bare pair. */
    readonly live: string;
    readonly expires: string;
    readonly refresh: string;
    readonly pending: string;
  };
  readonly health: DirectMountHealth | null;
}

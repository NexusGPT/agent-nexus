import type { createClient } from "../../client";
import { mountDirect } from "../workspace-mount-direct";
import { mountGateway } from "../workspace-mount-gateway";
import { mountOnto } from "./mount-onto";
import type { MountOutcome } from "./mount-outcome";
import type { MountPlan } from "./mount-plan";

/** Everything the two engines need to put the drive on the mount point. */
export interface PerformMountInput {
  readonly plan: MountPlan;
  readonly slug: string;
  readonly davPath: string;
  readonly mountPath: string;
  readonly readOnly: boolean;
  readonly useShared: boolean;
  readonly workspaceId: string | undefined;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutSeconds: number | undefined;
  readonly client: ReturnType<typeof createClient>;
}

/** Mount the drive with whichever engine the plan settled on. */
export async function performMount(input: PerformMountInput): Promise<MountOutcome> {
  const { plan, slug, davPath, mountPath, readOnly, useShared, workspaceId } = input;
  const { baseUrl, apiKey, timeoutSeconds, client } = input;
  return mountOnto(mountPath, () =>
    plan.engine === "direct"
      ? mountDirect({
          slug,
          mountPath,
          readOnly,
          shared: useShared,
          workspaceId,
          mountId: plan.mountId,
          baseUrl,
          pins: plan.pins,
          awsConfig: plan.awsConfig,
          binary: plan.binary,
          client
        })
      : mountGateway({
          settled: plan,
          slug,
          davPath,
          baseUrl,
          apiKey,
          mountPath,
          readOnly,
          timeoutSeconds
        })
  );
}

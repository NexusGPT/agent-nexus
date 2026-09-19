import { color, isJsonMode, printRecord } from "../../../output";
import { type GetVibeClusterResponse } from "./vibe-cluster-wire";

export function printVibeCluster(data: GetVibeClusterResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data.cluster === null) {
    console.log(color.dim("No dedicated cluster."));
    console.log(
      color.dim(
        'A git project created with --git-url (bring-your-own-git) still builds and\ndeploys on shared infrastructure with no cluster required. A Nexus-hosted git\nproject ("git-project create" with no --git-url) needs a healthy dedicated\ncluster and stays PENDING until one exists. Provision one: nexus apps cluster provision --region <region>'
      )
    );
    return;
  }
  printRecord({
    Status: data.cluster.status,
    Reason: data.cluster.statusReason ?? color.dim("—"),
    "Git host": data.cluster.gitHostStatus ?? color.dim("not reported yet"),
    Telemetry: data.cluster.telemetryStatus ?? color.dim("not reported yet")
  });
}

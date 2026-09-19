import { color, isJsonMode, printRecord } from "../../../output";
import { type ExternalToolDetail } from "../../../vibe-wire-types";
import { formatTimestamp } from "./format-timestamp";

export function printRegisteredTool(tool: ExternalToolDetail): void {
  if (isJsonMode()) {
    // Pass the tool detail through unchanged so jq consumers see the
    // create-external-tool shape as the backend emitted it.
    console.log(JSON.stringify(tool, null, 2));
    return;
  }

  console.log(color.green("✓") + " Registered Vibe app as agent tool");
  printRecord(tool, [
    { key: "id", label: "Tool ID" },
    { key: "name", label: "Name" },
    { key: "type", label: "Type" },
    { key: "endpointUrl", label: "Endpoint" },
    { key: "status", label: "Status" },
    { key: "actionsCount", label: "Actions" },
    { key: "authType", label: "Auth" },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);
}

import { isJsonMode, printRecord } from "../../../output";
import { type VibeAppEnvVarDto } from "../../../vibe-wire-types";
import { formatTimestamp } from "./format-timestamp";

export function printEnvVar(envVar: VibeAppEnvVarDto): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(envVar, null, 2));
    return;
  }

  printRecord(envVar, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "value", label: "Value" },
    { key: "scope", label: "Scope" },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) },
    { key: "updatedAt", label: "Updated", format: (v) => formatTimestamp(String(v)) }
  ]);
}

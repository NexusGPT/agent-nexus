import { color, isJsonMode, printTable } from "../../../output";
import { type ListEnvVarsResponse } from "../../../vibe-wire-types";
import { scopeRank, toCardBindingRow, toEnvVarRow } from "./env-table-row";

export function printEnvVarList(data: ListEnvVarsResponse): void {
  if (isJsonMode()) {
    // The wire envelope through unchanged: `.envVars[]` stays exactly where
    // every existing jq consumer already reads it, and `.cardBindings[]`
    // arrives as a purely additive sibling.
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // `?? []` collapses "this server predates cards" into "this app has none"
  // for RENDERING only. The distinction is preserved on the wire and in
  // --json; here both correctly produce a table with no card rows.
  const bindings = data.cardBindings ?? [];

  if (data.envVars.length === 0 && bindings.length === 0) {
    console.log(color.dim("Nothing set in this app's environment."));
    return;
  }

  // Sorted here rather than trusted from the wire: the two kinds arrive as two
  // arrays, each ordered within itself, so a merged order only exists if this
  // side makes one. Scope then name is the order the deployer resolves in.
  const rows = [...data.envVars.map(toEnvVarRow), ...bindings.map(toCardBindingRow)].sort(
    (a, b) => scopeRank(a.scope) - scopeRank(b.scope) || a.name.localeCompare(b.name)
  );

  printTable(rows, [
    { key: "id", label: "Id" },
    { key: "name", label: "Name" },
    { key: "value", label: "Value" },
    { key: "source", label: "Source" },
    { key: "card", label: "Card" },
    { key: "scope", label: "Scope" },
    { key: "status", label: "Status" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

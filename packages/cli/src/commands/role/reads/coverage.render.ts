import type { RoleCoverage } from "@agent-nexus/sdk";

import { printRecord, printWarning } from "../../../output";
import { coverageMoney } from "../_shared/coverage-money";

/** Prints `nexus role coverage`. `printRecord` owns the `--json` branch, as it does on every leaf. */
export function renderRoleCoverage(view: RoleCoverage): void {
  printRecord(view, [
    { key: "roleId", label: "Role" },
    {
      key: "coverage",
      label: "Coverage",
      // A percentage is printed ONLY from the `modelled` arm. Rendering the
      // other arm as 0% is the single failure this whole union prevents.
      format: () =>
        view.coverage.kind === "modelled"
          ? `${(view.coverage.ratio * 100).toFixed(2)}%`
          : `not modelled (${view.coverage.reason})`
    },
    {
      key: "workloadPersonHours",
      label: "Worked h/yr",
      format: () => view.workloadPersonHours?.toString() ?? "not modelled"
    },
    { key: "impactPersonHours", label: "Automated h/yr" },
    {
      key: "contributions",
      label: "Modelled systems",
      format: () => String(view.contributions.length)
    },
    {
      key: "unmodelledSystems",
      label: "Unmodelled systems",
      format: () => String(view.unmodelledSystems.length)
    },
    {
      key: "savingsProjection",
      label: "Projected saving",
      format: () =>
        view.savingsProjection.kind === "projected"
          ? `${coverageMoney(view.savingsProjection.amount)} ${view.savingsProjection.currency}` +
            ` (at ${coverageMoney(view.savingsProjection.ratePerHour)}/h)`
          : `unavailable (${view.savingsProjection.reason})`
    },
    {
      key: "money",
      label: "Money",
      format: () =>
        view.money.kind === "modelled"
          ? `${view.money.currency} · revenue ${coverageMoney(view.money.totals.revenue)}` +
            ` · cost ${coverageMoney(view.money.totals.cost)}` +
            ` · workload cost ${
              view.money.totals.workloadCost === null
                ? "not modelled"
                : coverageMoney(view.money.totals.workloadCost)
            }`
          : `not modelled (${view.money.reason})`
    },
    {
      key: "integrity",
      label: "Integrity",
      format: () => `${view.integrity.status} (${String(view.integrity.warnings.length)} warnings)`
    }
  ]);

  if (view.integrity.status === "DEGRADED") {
    printWarning(
      "This coverage figure is DEGRADED — at least one model did not evaluate.",
      ...view.integrity.warnings.map((w) => `${w.severity}: ${w.code} — ${w.message}`)
    );
  }
}

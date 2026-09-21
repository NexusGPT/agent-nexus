import { color, isJsonMode, printTable } from "../../output";
import type { UserOrganization } from "./_shared/fetch-organizations";

/** The `nexus auth orgs` table, and the platform-operator trailer beneath it. */
export function renderOrganizations(
  listed: UserOrganization[],
  activeOrgId: string | undefined,
  activeIsForeign: boolean
): void {
  const rows = listed.map((org) => ({
    marker: org.organizationId === activeOrgId ? "▸" : " ",
    name: org.name ?? color.dim("—"),
    role: org.role,
    organizationId: org.organizationId
  }));

  printTable(rows, [
    { key: "marker", label: " ", width: 2 },
    { key: "name", label: "ORGANIZATION" },
    { key: "role", label: "ROLE" },
    { key: "organizationId", label: "ORG ID" }
  ]);

  // A prose trailer after printTable is a second thing on stdout. The row
  // already carries `role: "platform-operator"`, so --json loses nothing.
  if (activeIsForeign && !isJsonMode()) {
    console.log(
      color.dim(
        "\nThe active organization is outside your memberships — a platform-operator key " +
          "is acting on it. Every request is recorded in the admin audit log."
      )
    );
  }
}

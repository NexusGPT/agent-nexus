import { color } from "../../output";

/** Why a drive that was asked for read-write came up read-only. */
export function printGrantedReadOnly(slug: string): void {
  console.log(
    color.yellow(
      `  Mounted READ-ONLY: Nexus granted read access to "${slug}" — your key's scopes, the ` +
        "workspace kind, or a shared library without a write grant. Saves would be refused, so " +
        "the drive refuses them first."
    )
  );
}

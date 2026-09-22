import { color, isJsonMode } from "../../../output";
import { type SetVibeAppPrimaryDomainResponse } from "../../../vibe-domain-wire-types";

/** `apps domains primary`: which host is canonical now. */
export function printPrimaryDomain(
  data: SetVibeAppPrimaryDomainResponse,
  host: string | null
): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(
    data.primaryDomainId === null
      ? `${color.green("✓")} Primary cleared — the app's platform host is canonical again`
      : `${color.green("✓")} ${host ?? data.primaryDomainId} is now the primary host`
  );
}

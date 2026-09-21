import type { CredentialProbe, ProbeRefusal } from "../../auth-probe";
import type { ResolvedOrganization, ResolvedProfile } from "../../config";

/** Everything `nexus auth status` resolved, as both renderings read it. */
export interface StatusView {
  resolved: ResolvedProfile;
  sourceExplanation: Record<string, string>;
  isCrossOrg: boolean;
  isOperator: boolean;
  orgName: string | undefined;
  org: ResolvedOrganization;
  maskedKey: string;
  baseUrl: string;
  probe: CredentialProbe | null;
  refusal: ProbeRefusal | null;
}

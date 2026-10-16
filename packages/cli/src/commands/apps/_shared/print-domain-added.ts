import { color, isJsonMode } from "../../../output";
import {
  type AddVibeAppDomainResponse,
  VIBE_APP_DOMAIN_WIRE_PENDING_CLAIM_TTL_DAYS
} from "../../../vibe-domain-wire-types";
import { colorizeDomainStatus } from "./colorize-domain-status";
import { printDomainDnsInstructions } from "./print-domain-dns-instructions";

/** `apps domains add`: the domain, the records to create, and the one next step. */
export function printDomainAdded(data: AddVibeAppDomainResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { domain } = data;
  console.log(
    `${color.green("✓")} Added ${domain.host} (${domain.kind}) — ${colorizeDomainStatus(domain.status)}`
  );
  console.log("");
  printDomainDnsInstructions(domain.dns);
  // No next step for a status this binary does not list: it cannot say which applies.
  if (domain.dns.status === "ready") {
    console.log("");
    console.log(
      `Next: once the record resolves, run  nexus apps domains verify ${domain.appId} ${domain.host}`
    );
  } else if (domain.dns.status === "unavailable") {
    console.log("");
    console.log(
      `Next: run  nexus apps domains list ${domain.appId}  later — the records appear there once they can be given.`
    );
  }

  // The deadline on that next step, and the only thing on this screen the reader
  // acts on away from the terminal: the host is HELD while the row exists, so an
  // unproven claim is released rather than kept forever. Printed on the same
  // condition the dashboard uses — PENDING_DNS and never yet seen at the edge —
  // rather than assumed from the fact that this is `add`, because a domain that
  // verified once and lost its DNS is an owner's problem and not a squat, and
  // telling them it is about to be given away would be false.
  if (domain.status === "PENDING_DNS" && domain.verifiedAt === null) {
    console.log("");
    console.log(
      color.dim(
        `If this domain does not point here within ${VIBE_APP_DOMAIN_WIRE_PENDING_CLAIM_TTL_DAYS} days, the claim is released and the host becomes free for any organisation to add.`
      )
    );
  }
}

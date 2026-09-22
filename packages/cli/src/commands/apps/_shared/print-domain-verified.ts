import { color, isJsonMode } from "../../../output";
import { type VerifyVibeAppDomainResponse } from "../../../vibe-domain-wire-types";
import { colorizeDomainStatus } from "./colorize-domain-status";
import { printDomainDnsInstructions } from "./print-domain-dns-instructions";

/**
 * `apps domains verify`: where the domain stands after the check. A domain whose
 * DNS still does not point at the edge gets its records again, because the
 * reader re-running verify is the reader who has not created them correctly yet.
 */
export function printDomainVerified(data: VerifyVibeAppDomainResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const { domain } = data;
  console.log(`${domain.host} — ${colorizeDomainStatus(domain.status)}`);
  if (domain.statusReason !== null) console.log(`  ${domain.statusReason}`);

  if (domain.status === "PENDING_DNS" || domain.status === "FAILED") {
    console.log("");
    printDomainDnsInstructions(domain.dns);
    return;
  }
  if (domain.status === "ISSUING_CERT") {
    console.log(color.dim("DNS points at the edge; the certificate is being issued."));
  }
}

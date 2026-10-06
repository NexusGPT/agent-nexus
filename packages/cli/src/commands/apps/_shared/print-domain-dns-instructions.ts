import { color, printTable } from "../../../output";
import {
  VIBE_APP_DOMAIN_DNS_INSTRUCTION_STATUSES,
  type VibeAppDomainDnsInstructionsRead
} from "../../../vibe-domain-wire-types";
import { isListedVariant } from "../../../vibe-unlisted-variant";
import { formatUnlistedWord } from "./format-unlisted-word";

/**
 * The records the owner must create, as a table they can copy — or, when the
 * server has none to give, its reason and NO record.
 *
 * 🚨 THE `unavailable` ARM PRINTS NO ADDRESS, AND THAT IS THE WHOLE POINT OF IT.
 * It is an apex domain before the edge's static addresses are configured, and an
 * apex cannot carry a CNAME. Any value printed there would be invented, and a
 * customer who copies it points their root domain at a machine that is not ours.
 * A status a newer backend added prints NO record for the same reason: this
 * binary cannot tell which of its fields, if any, is an address to copy.
 */
export function printDomainDnsInstructions(dns: VibeAppDomainDnsInstructionsRead): void {
  if (!isListedVariant("status", VIBE_APP_DOMAIN_DNS_INSTRUCTION_STATUSES, dns)) {
    console.log(`DNS instructions: ${formatUnlistedWord(dns.status, "status")}`);
    console.log(color.dim("  Read them with --json, or upgrade: npm i -g @agent-nexus/cli"));
    return;
  }
  if (dns.status === "unavailable") {
    console.log(color.yellow("No DNS records can be given for this domain yet."));
    console.log(`  ${dns.reason}`);
    return;
  }

  console.log("Create at your DNS provider:");
  console.log("");
  printTable(dns.records, [
    { key: "type", label: "Type" },
    { key: "name", label: "Name" },
    { key: "value", label: "Value" }
  ]);
}

import { color, printTable } from "../../../output";
import { type VibeAppDomainDnsInstructionsDto } from "../../../vibe-domain-wire-types";

/**
 * The records the owner must create, as a table they can copy — or, when the
 * server has none to give, its reason and NO record.
 *
 * 🚨 THE `unavailable` ARM PRINTS NO ADDRESS, AND THAT IS THE WHOLE POINT OF IT.
 * It is an apex domain before the edge's static addresses are configured, and an
 * apex cannot carry a CNAME. Any value printed there would be invented, and a
 * customer who copies it points their root domain at a machine that is not ours.
 */
export function printDomainDnsInstructions(dns: VibeAppDomainDnsInstructionsDto): void {
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

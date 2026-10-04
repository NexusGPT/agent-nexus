import type { Command } from "commander";

/**
 * Every flag of `nexus channel whatsapp-template create`. Lifted out of the
 * command verbatim and applied in the same order, so `bindCommand` — which
 * reads the command's own option list — sees exactly what it saw before.
 */
export function addTemplateCreateOptions(waTemplateCreate: Command): Command {
  return waTemplateCreate
    .requiredOption("--connection-id <id>", "Messaging connection ID")
    .requiredOption("--friendly-name <name>", "Template name (e.g., order_confirmation)")
    .requiredOption("--language <lang>", "Language code (e.g., en, en_US)")
    .option("--body <text>", "Template body text (auto-wraps as twilio/text type)")
    .option("--body-file <path>", "Path to JSON file with full Twilio Types object")
    .option("--type <type>", "Twilio type key when using --body", "twilio/text")
    .option("--variables <json>", 'Template variables as JSON (e.g., \'{"1":"default"}\')')
    .option("--submit", "Also submit for Meta approval after creation")
    .option(
      "--category <category>",
      "Approval category (required with --submit): UTILITY, MARKETING, AUTHENTICATION"
    );
}

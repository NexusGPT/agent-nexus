import type { Command } from "commander";

import { enumOption } from "../../../contract-binding";
import { DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH__BODY_TYPE } from "../../deployment.contract.generated";

/**
 * Every flag of `nexus deployment template attach`. Lifted out of the command
 * verbatim and applied in the same order, so `bindCommand` — which reads the
 * command's own option list — sees exactly what it saw before.
 */
export function addTemplateAttachOptions(templateAttach: Command): Command {
  return (
    templateAttach
      .requiredOption("--template-id <id>", "Template ID (Twilio SID)")
      .requiredOption("--name <name>", "Display name for this template")
      .requiredOption("--description <text>", "Description of what this template does")
      .option(
        "--variables <json>",
        'Variables JSON: {"1":{"description":"Name","isBodyVariable":true}}'
      )
      // The list used to be typed into the description, where nothing checked it
      // and nothing refused a fourth value. Commander prints the choices itself,
      // so repeating them here would be a second copy to go stale.
      .addOption(
        enumOption(
          "--type <type>",
          "Template type",
          DEPLOYMENT_WHATSAPP_TEMPLATE_ATTACH__BODY_TYPE
        ).default("template")
      )
      .option("--enable-multi-language", "Enable multi-language support")
      .option(
        "--template-group <json>",
        "Template group JSON mapping languages to template IDs (standard templates)"
      )
      .option("--enable-dynamic-size", "Enable dynamic carousel size (carousel only)")
      .option(
        "--carousel-template-group <json>",
        "Carousel template group JSON with size variants (carousel only)"
      )
      .option(
        "--single-item-card-template-id <id>",
        "Fallback card template ID for single-item carousels"
      )
      .option(
        "--single-item-card-template-group <json>",
        "Single-item card template group JSON for multi-language fallback"
      )
  );
}

import { refuse } from "../../../errors";
import { CONTRADICTORY_TOGGLE_HINT, readEnableDisablePair } from "./enable-disable-pair";

/** The flags `nexus deployment template update` turns into a PATCH body. */
export interface TemplateUpdateOptions {
  readonly name?: string;
  readonly description?: string;
  readonly enableMultiLanguage?: boolean;
  readonly multiLanguage?: boolean;
  readonly enableDynamicSize?: boolean;
  readonly dynamicSize?: boolean;
  readonly singleItemCardTemplateId?: string;
  readonly variables?: string;
  readonly templateGroup?: string;
  readonly carouselTemplateGroup?: string;
  readonly singleItemCardTemplateGroup?: string;
}

/**
 * Build the PATCH body for `nexus deployment template update`, lifted out of the
 * action verbatim.
 *
 * Returns `undefined` HAVING ALREADY SET `process.exitCode` — every refusal here
 * is the same `refuse()` call, with the same message, that used to sit inline;
 * only the statement it returns from moved.
 */
export function buildTemplateUpdateBody(
  opts: TemplateUpdateOptions
): Record<string, unknown> | undefined {
  // `readEnableDisablePair` owns why this reads two keys per setting and
  // why both flags together is a refusal rather than a precedence rule.
  const multiLanguage = readEnableDisablePair(opts.enableMultiLanguage, opts.multiLanguage);
  if (multiLanguage.contradiction) {
    process.exitCode = refuse(
      "--enable-multi-language and --no-multi-language contradict each other.",
      CONTRADICTORY_TOGGLE_HINT
    );
    return undefined;
  }

  const dynamicSize = readEnableDisablePair(opts.enableDynamicSize, opts.dynamicSize);
  if (dynamicSize.contradiction) {
    process.exitCode = refuse(
      "--enable-dynamic-size and --no-dynamic-size contradict each other.",
      CONTRADICTORY_TOGGLE_HINT
    );
    return undefined;
  }

  const body: Record<string, unknown> = {};
  if (opts.name !== undefined) body.name = opts.name;
  if (opts.description !== undefined) body.description = opts.description;
  if (multiLanguage.value !== undefined) body.enableMultiLanguage = multiLanguage.value;
  if (dynamicSize.value !== undefined) body.enableDynamicSize = dynamicSize.value;
  if (opts.singleItemCardTemplateId !== undefined)
    body.singleItemCardTemplateId = opts.singleItemCardTemplateId;
  if (opts.variables) {
    try {
      body.variables = JSON.parse(opts.variables);
    } catch {
      process.exitCode = refuse("--variables must be valid JSON.");
      return undefined;
    }
  }
  if (opts.templateGroup) {
    try {
      body.templateGroup = JSON.parse(opts.templateGroup);
    } catch {
      process.exitCode = refuse("--template-group must be valid JSON.");
      return undefined;
    }
  }
  if (opts.carouselTemplateGroup) {
    try {
      body.carouselTemplateGroup = JSON.parse(opts.carouselTemplateGroup);
    } catch {
      process.exitCode = refuse("--carousel-template-group must be valid JSON.");
      return undefined;
    }
  }
  if (opts.singleItemCardTemplateGroup) {
    try {
      body.singleItemCardTemplateGroup = JSON.parse(opts.singleItemCardTemplateGroup);
    } catch {
      process.exitCode = refuse("--single-item-card-template-group must be valid JSON.");
      return undefined;
    }
  }
  return body;
}

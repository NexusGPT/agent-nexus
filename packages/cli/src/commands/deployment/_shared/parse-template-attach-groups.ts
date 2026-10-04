import type {
  DeploymentCarouselTemplateGroup,
  DeploymentSingleItemCardTemplateGroup,
  DeploymentTemplateGroup,
  DeploymentTemplateVariable
} from "@agent-nexus/sdk";

import { refuse } from "../../../errors";
import { asRequestBody } from "../../../util/body";

/** The four operator-supplied JSON flags of `deployment template attach`. */
export interface TemplateAttachGroups {
  readonly variables?: Record<string, DeploymentTemplateVariable>;
  readonly templateGroup?: DeploymentTemplateGroup;
  readonly carouselTemplateGroup?: DeploymentCarouselTemplateGroup;
  readonly singleItemCardTemplateGroup?: DeploymentSingleItemCardTemplateGroup;
}

/**
 * Parse the JSON-bearing flags of `nexus deployment template attach`, lifted out
 * of the action verbatim.
 *
 * Returns `undefined` HAVING ALREADY SET `process.exitCode` — each refusal is the
 * same `refuse()` call, with the same message, that used to sit inline.
 */
export function parseTemplateAttachGroups(opts: {
  readonly variables?: string;
  readonly templateGroup?: string;
  readonly carouselTemplateGroup?: string;
  readonly singleItemCardTemplateGroup?: string;
}): TemplateAttachGroups | undefined {
  // Each of these three flags is operator-supplied JSON crossing into a
  // typed SDK argument — the same boundary `asRequestBody` names, applied
  // to a nested field rather than to a whole body. Naming the SDK type on
  // the local is what makes the call site below check the field names.
  let variables: Record<string, DeploymentTemplateVariable> | undefined;
  if (opts.variables) {
    try {
      variables = asRequestBody<Record<string, DeploymentTemplateVariable>>(
        JSON.parse(opts.variables)
      );
    } catch {
      process.exitCode = refuse("--variables must be valid JSON.");
      return undefined;
    }
  }

  let templateGroup: DeploymentTemplateGroup | undefined;
  if (opts.templateGroup) {
    try {
      templateGroup = asRequestBody<DeploymentTemplateGroup>(JSON.parse(opts.templateGroup));
    } catch {
      process.exitCode = refuse("--template-group must be valid JSON.");
      return undefined;
    }
  }

  let carouselTemplateGroup: DeploymentCarouselTemplateGroup | undefined;
  if (opts.carouselTemplateGroup) {
    try {
      carouselTemplateGroup = asRequestBody<DeploymentCarouselTemplateGroup>(
        JSON.parse(opts.carouselTemplateGroup)
      );
    } catch {
      process.exitCode = refuse("--carousel-template-group must be valid JSON.");
      return undefined;
    }
  }

  let singleItemCardTemplateGroup: DeploymentSingleItemCardTemplateGroup | undefined;
  if (opts.singleItemCardTemplateGroup) {
    try {
      singleItemCardTemplateGroup = asRequestBody<DeploymentSingleItemCardTemplateGroup>(
        JSON.parse(opts.singleItemCardTemplateGroup)
      );
    } catch {
      process.exitCode = refuse("--single-item-card-template-group must be valid JSON.");
      return undefined;
    }
  }

  return { variables, templateGroup, carouselTemplateGroup, singleItemCardTemplateGroup };
}

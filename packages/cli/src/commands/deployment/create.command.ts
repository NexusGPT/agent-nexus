import type { CreateDeploymentBody } from "@agent-nexus/sdk";
import type { Command } from "commander";

import { createClient } from "../../client";
import { bindCommand, enumOption } from "../../contract-binding";
import { dashboardUrlFor } from "../../dashboard-url";
import { handleError } from "../../errors";
import { printSuccess } from "../../output";
import { asRequestBody, mergeBodyWithFlags, resolveBody } from "../../util/body";
import {
  DEPLOYMENT_CREATE__BODY_TYPE,
  DEPLOYMENT_CREATE_CONTRACT
} from "../deployment.contract.generated";
import { CASE_INSENSITIVE, upperCase } from "./_shared/case-insensitive";
import { CREATE_NOTES } from "./copy/create-notes";

/** `nexus deployment create` */
export function registerDeploymentCreateCommand(deployment: Command, program: Command): void {
  const create = deployment
    .command("create")
    .description("Create a new deployment")
    // --name and --type are part of the API contract (CreateDeploymentBody)
    // but they can also come from --body, so neither is a Commander-required
    // option — the API returns a clean validation error if either is missing.
    .option("--name <name>", "Deployment name")
    // The 21 values were retyped here as one long sentence. They now come from
    // the contract minus the declared omission, so this list cannot drift from
    // the schema and cannot re-acquire `SMS` without the gate saying so.
    .addOption(
      enumOption(
        "--type <type>",
        "Deployment type",
        DEPLOYMENT_CREATE__BODY_TYPE,
        CASE_INSENSITIVE,
        upperCase
      )
    )
    .option("--agent-id <id>", "Agent ID to deploy")
    .option("--description <text>", "Deployment description")
    .option("--body <json>", "Request body as JSON, .json file, or '-' for stdin")
    .addHelpText("after", CREATE_NOTES)
    .action(async (opts) => {
      try {
        const globals = program.optsWithGlobals();
        const client = createClient(globals);
        const base = await resolveBody(opts.body);
        // DeploymentTypeSchema accepts only uppercase enum values; the CLI
        // historically advertised lowercase aliases in the help text that
        // the API never accepted. Normalise here so both styles work.
        const normalisedType = typeof opts.type === "string" ? opts.type.toUpperCase() : opts.type;
        const body = mergeBodyWithFlags(base, {
          ...(opts.name !== undefined && { name: opts.name }),
          ...(normalisedType !== undefined && { type: normalisedType }),
          ...(opts.agentId !== undefined && { agentId: opts.agentId }),
          ...(opts.description !== undefined && { description: opts.description })
        });

        const dep = await client.deployments.create(asRequestBody<CreateDeploymentBody>(body));
        printSuccess("Deployment created.", {
          id: dep.id,
          name: dep.name,
          type: dep.type,
          dashboardUrl: dashboardUrlFor("deployment", dep.id, globals)
        });
      } catch (err) {
        process.exitCode = handleError(err);
      }
    });

  // Bound LAST, after every option exists and after the hand-written prose, so
  // the generated reference lands below the Notes rather than above them.
  bindCommand(create, DEPLOYMENT_CREATE_CONTRACT);
}

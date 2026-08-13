// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// `commands/contract-help.test.ts` re-derives this from the live contract and
// fails when the committed copy drifts, so a contract change cannot ship with
// the CLI still offering the old values.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// `emulator.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const EMULATOR_CREATE_SESSION_CONTRACT = {
  name: "EmulatorCreateSession",
  method: "POST",
  route: "/public/v1/emulator/:deploymentId/sessions",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.participants", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.participants[].identifier", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.participants[].displayName", slot: "Body", type: "string", required: false, depth: 1 }
  ]
} as const satisfies ProjectedDescriptor;

export const EMULATOR_DELETE_SCENARIO_CONTRACT = {
  name: "EmulatorDeleteScenario",
  method: "DELETE",
  route: "/public/v1/emulator/scenarios/:scenarioId",
  fields: [
    { path: "PathVars.scenarioId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const EMULATOR_DELETE_SESSION_CONTRACT = {
  name: "EmulatorDeleteSession",
  method: "DELETE",
  route: "/public/v1/emulator/:deploymentId/sessions/:sessionId",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.sessionId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const EMULATOR_GET_SCENARIO_CONTRACT = {
  name: "EmulatorGetScenario",
  method: "GET",
  route: "/public/v1/emulator/scenarios/:scenarioId",
  fields: [
    { path: "PathVars.scenarioId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const EMULATOR_LIST_SCENARIOS_CONTRACT = {
  name: "EmulatorListScenarios",
  method: "GET",
  route: "/public/v1/emulator/scenarios",
  fields: [
    { path: "Params.deploymentId", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const EMULATOR_LIST_SESSIONS_CONTRACT = {
  name: "EmulatorListSessions",
  method: "GET",
  route: "/public/v1/emulator/:deploymentId/sessions",
  fields: [
    { path: "PathVars.deploymentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const EMULATOR_SAVE_SCENARIO_CONTRACT = {
  name: "EmulatorSaveScenario",
  method: "POST",
  route: "/public/v1/emulator/scenarios",
  fields: [
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.description", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.sessionId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.deploymentId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

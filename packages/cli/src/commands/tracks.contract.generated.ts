// GENERATED FILE — DO NOT EDIT BY HAND.
// Source: packages/types/src/api/public/v1/contract/, via z.toJSONSchema.
// Regenerate: pnpm --filter @agent-nexus/cli run gen:contract-help
//
// NOTHING UNDER `src/` RE-DERIVES THIS. That needs Zod, which the published
// binary does not depend on, so `commands/contract-help.test.ts` checks the
// flags against this data and says so in its own header — it cannot tell you
// the data is current. `scripts/generated-drift.mjs` is what does: it
// regenerates and requires a byte-exact match, at review time in the
// `Generated config` job of pr-checks.yml and again on every push to
// staging/main.
//
// 🚨 THIS FILE IS ONE OF TWO OPINIONS, NEVER THE AUTHORITY. Where the CLI offers
// fewer values than the contract lists, the reason is declared at the flag in
// `tracks.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ContractEnum } from "../contract-binding";
import type { ProjectedDescriptor } from "../contract-help.render";

export const TRACK_APPEND_DIARY_ENTRY__BODY_KIND = {
  path: "TrackAppendDiaryEntry.Body.kind",
  contractValues: [
    "PROGRESS",
    "FINDING",
    "DECISION",
    "PROOF",
    "BLOCKER",
    "QUESTION",
    "KILLED",
    "NOTE"
  ]
} as const satisfies ContractEnum;

export const TRACK_CLOSE_AGENT__BODY_STATE = {
  path: "TrackCloseAgent.Body.state",
  contractValues: [
    "CLOSED",
    "DEAD",
    "RETIRED"
  ]
} as const satisfies ContractEnum;

export const TRACK_CREATE__BODY_NEXT_OWNER = {
  path: "TrackCreate.Body.nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_KIND = {
  path: "TrackImportPlan.Body.tasks[].kind",
  contractValues: [
    "STEP",
    "DECISION",
    "DEFINITION"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_NEXT_OWNER = {
  path: "TrackImportPlan.Body.tasks[].nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_CHILDREN_ITEM_KIND = {
  path: "TrackImportPlan.Body.tasks[].children[].kind",
  contractValues: [
    "STEP",
    "DECISION",
    "DEFINITION"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_CHILDREN_ITEM_NEXT_OWNER = {
  path: "TrackImportPlan.Body.tasks[].children[].nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_CHILDREN_ITEM_CHILDREN_ITEM_KIND = {
  path: "TrackImportPlan.Body.tasks[].children[].children[].kind",
  contractValues: [
    "STEP",
    "DECISION",
    "DEFINITION"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_CHILDREN_ITEM_CHILDREN_ITEM_NEXT_OWNER = {
  path: "TrackImportPlan.Body.tasks[].children[].children[].nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_CHILDREN_ITEM_CHILDREN_ITEM_CHILDREN_ITEM_KIND = {
  path: "TrackImportPlan.Body.tasks[].children[].children[].children[].kind",
  contractValues: [
    "STEP",
    "DECISION",
    "DEFINITION"
  ]
} as const satisfies ContractEnum;

export const TRACK_IMPORT_PLAN__BODY_TASKS_ITEM_CHILDREN_ITEM_CHILDREN_ITEM_CHILDREN_ITEM_NEXT_OWNER = {
  path: "TrackImportPlan.Body.tasks[].children[].children[].children[].nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_LIST__PARAMS_STATUS = {
  path: "TrackList.Params.status",
  contractValues: [
    "PLANNED",
    "IN_PROGRESS",
    "BLOCKED",
    "IN_REVIEW",
    "DONE"
  ]
} as const satisfies ContractEnum;

export const TRACK_LIST__PARAMS_ARCHIVED = {
  path: "TrackList.Params.archived",
  contractValues: [
    "exclude",
    "only",
    "include"
  ]
} as const satisfies ContractEnum;

export const TRACK_LIST__PARAMS_NEXT_OWNER = {
  path: "TrackList.Params.nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_LIST_AGENTS__PARAMS_STATE = {
  path: "TrackListAgents.Params.state",
  contractValues: [
    "OPEN",
    "CLOSED",
    "DEAD",
    "RETIRED"
  ]
} as const satisfies ContractEnum;

export const TRACK_LIST_DIARY_ENTRIES__PARAMS_KIND = {
  path: "TrackListDiaryEntries.Params.kind",
  contractValues: [
    "PROGRESS",
    "FINDING",
    "DECISION",
    "PROOF",
    "BLOCKER",
    "QUESTION",
    "KILLED",
    "NOTE"
  ]
} as const satisfies ContractEnum;

export const TRACK_SET_NEXT_OWNER__BODY_NEXT_OWNER = {
  path: "TrackSetNextOwner.Body.nextOwner",
  contractValues: [
    "CUE",
    "USER",
    "EVENT"
  ]
} as const satisfies ContractEnum;

export const TRACK_SET_STATUS__BODY_STATUS = {
  path: "TrackSetStatus.Body.status",
  contractValues: [
    "PLANNED",
    "IN_PROGRESS",
    "BLOCKED",
    "IN_REVIEW",
    "DONE"
  ]
} as const satisfies ContractEnum;

export const TRACK_APPEND_DIARY_ENTRY_CONTRACT = {
  name: "TrackAppendDiaryEntry",
  method: "POST",
  route: "/public/v1/tracks/:trackId/diary",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.kind", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["PROGRESS", "FINDING", "DECISION", "PROOF", "BLOCKER", "QUESTION", "KILLED", "NOTE"] },
    { path: "Body.body", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.taskId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.agentId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.workspaceId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.artifactPath", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_APPEND_EVENT_CONTRACT = {
  name: "TrackAppendEvent",
  method: "POST",
  route: "/public/v1/tracks/:trackId/events",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.type", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.payload", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.actorAgentId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_ARCHIVE_CONTRACT = {
  name: "TrackArchive",
  method: "POST",
  route: "/public/v1/tracks/:trackId/archive",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.archived", slot: "Body", type: "boolean", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_BEAT_AGENT_CONTRACT = {
  name: "TrackBeatAgent",
  method: "POST",
  route: "/public/v1/tracks/:trackId/agents/:agentId/beat",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_CLAIM_TASK_CONTRACT = {
  name: "TrackClaimTask",
  method: "POST",
  route: "/public/v1/tracks/tasks/:taskId/claim",
  fields: [
    { path: "PathVars.taskId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.agentId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_CLOSE_AGENT_CONTRACT = {
  name: "TrackCloseAgent",
  method: "POST",
  route: "/public/v1/tracks/:trackId/agents/:agentId/close",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.agentId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.state", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["CLOSED", "DEAD", "RETIRED"] },
    { path: "Body.reason", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_CREATE_CONTRACT = {
  name: "TrackCreate",
  method: "POST",
  route: "/public/v1/tracks",
  fields: [
    { path: "Body.slug", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.title", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.shortTitle", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.currentStep", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.nextOwner", slot: "Body", type: "string", required: false, depth: 0, enumValues: ["CUE", "USER", "EVENT"] }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_CREATE_DEPENDENCY_EDGE_CONTRACT = {
  name: "TrackCreateDependencyEdge",
  method: "POST",
  route: "/public/v1/tracks/dependencies",
  fields: [
    { path: "Body.blockerTrackId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.blockedTrackId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_CREATE_SECTION_CONTRACT = {
  name: "TrackCreateSection",
  method: "POST",
  route: "/public/v1/tracks/:trackId/sections",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.parentSectionId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.slug", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.title", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.body", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.position", slot: "Body", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_CREATE_TASK_EDGE_CONTRACT = {
  name: "TrackCreateTaskEdge",
  method: "POST",
  route: "/public/v1/tracks/:trackId/task-edges",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.blockerTaskId", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.blockedTaskId", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_DELETE_MEMORY_ENTRY_CONTRACT = {
  name: "TrackDeleteMemoryEntry",
  method: "DELETE",
  route: "/public/v1/tracks/:trackId/memory/:key",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.key", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_IMPORT_PLAN_CONTRACT = {
  name: "TrackImportPlan",
  method: "POST",
  route: "/public/v1/tracks/:trackId/import-plan",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.parentTaskId", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.tasks", slot: "Body", type: "array", required: true, depth: 0 },
    { path: "Body.tasks[].title", slot: "Body", type: "string", required: true, depth: 1 },
    { path: "Body.tasks[].shortTitle", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.tasks[].acceptance", slot: "Body", type: "string", required: false, depth: 1 },
    { path: "Body.tasks[].gate", slot: "Body", type: "boolean", required: false, depth: 1 },
    { path: "Body.tasks[].kind", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["STEP", "DECISION", "DEFINITION"] },
    { path: "Body.tasks[].nextOwner", slot: "Body", type: "string", required: false, depth: 1, enumValues: ["CUE", "USER", "EVENT"] },
    { path: "Body.tasks[].children", slot: "Body", type: "array", required: false, depth: 1 },
    { path: "Body.tasks[].children[].title", slot: "Body", type: "string", required: true, depth: 2 },
    { path: "Body.tasks[].children[].shortTitle", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.tasks[].children[].acceptance", slot: "Body", type: "string", required: false, depth: 2 },
    { path: "Body.tasks[].children[].gate", slot: "Body", type: "boolean", required: false, depth: 2 },
    { path: "Body.tasks[].children[].kind", slot: "Body", type: "string", required: false, depth: 2, enumValues: ["STEP", "DECISION", "DEFINITION"] },
    { path: "Body.tasks[].children[].nextOwner", slot: "Body", type: "string", required: false, depth: 2, enumValues: ["CUE", "USER", "EVENT"] },
    { path: "Body.tasks[].children[].children", slot: "Body", type: "array", required: false, depth: 2 },
    { path: "Body.tasks[].children[].children[].title", slot: "Body", type: "string", required: true, depth: 3 },
    { path: "Body.tasks[].children[].children[].shortTitle", slot: "Body", type: "string", required: false, depth: 3 },
    { path: "Body.tasks[].children[].children[].acceptance", slot: "Body", type: "string", required: false, depth: 3 },
    { path: "Body.tasks[].children[].children[].gate", slot: "Body", type: "boolean", required: false, depth: 3 },
    { path: "Body.tasks[].children[].children[].kind", slot: "Body", type: "string", required: false, depth: 3, enumValues: ["STEP", "DECISION", "DEFINITION"] },
    { path: "Body.tasks[].children[].children[].nextOwner", slot: "Body", type: "string", required: false, depth: 3, enumValues: ["CUE", "USER", "EVENT"] },
    { path: "Body.tasks[].children[].children[].children", slot: "Body", type: "array", required: false, depth: 3 },
    { path: "Body.tasks[].children[].children[].children[].title", slot: "Body", type: "string", required: true, depth: 4 },
    { path: "Body.tasks[].children[].children[].children[].shortTitle", slot: "Body", type: "string", required: false, depth: 4 },
    { path: "Body.tasks[].children[].children[].children[].acceptance", slot: "Body", type: "string", required: false, depth: 4 },
    { path: "Body.tasks[].children[].children[].children[].gate", slot: "Body", type: "boolean", required: false, depth: 4 },
    { path: "Body.tasks[].children[].children[].children[].kind", slot: "Body", type: "string", required: false, depth: 4, enumValues: ["STEP", "DECISION", "DEFINITION"] },
    { path: "Body.tasks[].children[].children[].children[].nextOwner", slot: "Body", type: "string", required: false, depth: 4, enumValues: ["CUE", "USER", "EVENT"] },
    { path: "Body.edges", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.edges[].blockerIndex", slot: "Body", type: "integer", required: true, depth: 1 },
    { path: "Body.edges[].blockedIndex", slot: "Body", type: "integer", required: true, depth: 1 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_CONTRACT = {
  name: "TrackList",
  method: "GET",
  route: "/public/v1/tracks",
  fields: [
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.cursor", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.status", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PLANNED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE"] },
    { path: "Params.archived", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["exclude", "only", "include"] },
    { path: "Params.nextOwner", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["CUE", "USER", "EVENT"] }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_AGENTS_CONTRACT = {
  name: "TrackListAgents",
  method: "GET",
  route: "/public/v1/tracks/:trackId/agents",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.state", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["OPEN", "CLOSED", "DEAD", "RETIRED"] }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_DIARY_ENTRIES_CONTRACT = {
  name: "TrackListDiaryEntries",
  method: "GET",
  route: "/public/v1/tracks/:trackId/diary",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.kind", slot: "Params", type: "string", required: false, depth: 0, enumValues: ["PROGRESS", "FINDING", "DECISION", "PROOF", "BLOCKER", "QUESTION", "KILLED", "NOTE"] },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_EVENTS_CONTRACT = {
  name: "TrackListEvents",
  method: "GET",
  route: "/public/v1/tracks/:trackId/events",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_MEMORY_ENTRIES_CONTRACT = {
  name: "TrackListMemoryEntries",
  method: "GET",
  route: "/public/v1/tracks/:trackId/memory",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_ORGANIZATION_EVENTS_CONTRACT = {
  name: "TrackListOrganizationEvents",
  method: "GET",
  route: "/public/v1/track-events",
  fields: [
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 },
    { path: "Params.cursor", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.since", slot: "Params", type: "string", required: false, depth: 0 },
    { path: "Params.type", slot: "Params", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_READY_CONTRACT = {
  name: "TrackListReady",
  method: "GET",
  route: "/public/v1/tracks/ready",
  fields: [
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_READY_TASKS_CONTRACT = {
  name: "TrackListReadyTasks",
  method: "GET",
  route: "/public/v1/tracks/:trackId/tasks/ready",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Params.limit", slot: "Params", type: "integer", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_SECTIONS_CONTRACT = {
  name: "TrackListSections",
  method: "GET",
  route: "/public/v1/tracks/:trackId/sections",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_TASK_EDGES_CONTRACT = {
  name: "TrackListTaskEdges",
  method: "GET",
  route: "/public/v1/tracks/:trackId/task-edges",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_LIST_TASKS_CONTRACT = {
  name: "TrackListTasks",
  method: "GET",
  route: "/public/v1/tracks/:trackId/tasks",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_OPEN_AGENT_CONTRACT = {
  name: "TrackOpenAgent",
  method: "POST",
  route: "/public/v1/tracks/:trackId/agents",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.name", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.dependsOn", slot: "Body", type: "array", required: false, depth: 0 },
    { path: "Body.acceptance", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.inputs", slot: "Body", type: "object", required: false, depth: 0, opaque: true },
    { path: "Body.outputPath", slot: "Body", type: "string", required: false, depth: 0 },
    { path: "Body.model", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_PUT_MEMORY_ENTRY_CONTRACT = {
  name: "TrackPutMemoryEntry",
  method: "PUT",
  route: "/public/v1/tracks/:trackId/memory",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.key", slot: "Body", type: "string", required: true, depth: 0 },
    { path: "Body.value", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_READ_CONTRACT = {
  name: "TrackRead",
  method: "GET",
  route: "/public/v1/tracks/:trackId",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_READ_ROLLUP_CONTRACT = {
  name: "TrackReadRollup",
  method: "GET",
  route: "/public/v1/tracks/:trackId/rollup",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_READ_TASK_CONTRACT = {
  name: "TrackReadTask",
  method: "GET",
  route: "/public/v1/tracks/tasks/:taskId",
  fields: [
    { path: "PathVars.taskId", slot: "PathVars", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_RENAME_SECTION_CONTRACT = {
  name: "TrackRenameSection",
  method: "POST",
  route: "/public/v1/tracks/:trackId/sections/:sectionId/rename",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "PathVars.sectionId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.newSlug", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_SET_NEXT_OWNER_CONTRACT = {
  name: "TrackSetNextOwner",
  method: "POST",
  route: "/public/v1/tracks/:trackId/next-owner",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.nextOwner", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["CUE", "USER", "EVENT"] },
    { path: "Body.nextOwnerRef", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_SET_STATUS_CONTRACT = {
  name: "TrackSetStatus",
  method: "POST",
  route: "/public/v1/tracks/:trackId/status",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.status", slot: "Body", type: "string", required: true, depth: 0, enumValues: ["PLANNED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE"] }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_TOGGLE_TASK_CONTRACT = {
  name: "TrackToggleTask",
  method: "POST",
  route: "/public/v1/tracks/tasks/:taskId/toggle",
  fields: [
    { path: "PathVars.taskId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.done", slot: "Body", type: "boolean", required: true, depth: 0 },
    { path: "Body.evidence", slot: "Body", type: "string", required: false, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

export const TRACK_UPDATE_CURRENT_STEP_CONTRACT = {
  name: "TrackUpdateCurrentStep",
  method: "POST",
  route: "/public/v1/tracks/:trackId/current-step",
  fields: [
    { path: "PathVars.trackId", slot: "PathVars", type: "string", required: true, depth: 0 },
    { path: "Body.currentStep", slot: "Body", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

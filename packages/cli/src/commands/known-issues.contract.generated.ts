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
// `known-issues.ts` and printed in --help. The contract has already been the
// wrong one: it lists a deployment type the server 500s on.

import type { ProjectedDescriptor } from "../contract-help.render";

export const KNOWN_ISSUES_FOR_ROUTE_CONTRACT = {
  name: "KnownIssuesForRoute",
  method: "GET",
  route: "/public/v1/known-issues",
  fields: [
    { path: "Params.route", slot: "Params", type: "string", required: true, depth: 0 }
  ]
} as const satisfies ProjectedDescriptor;

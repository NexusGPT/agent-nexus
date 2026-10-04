import type { ChannelSetupResponse } from "@agent-nexus/sdk";

import { reportFailure } from "../../../errors";
import { isJsonMode, printTable } from "../../../output";
import { SETUP_STEP_COLUMNS } from "./setup-step-columns";

/**
 * The NOT-READY arm of `nexus channel setup` — the whole reason this command
 * has an exit code. Lifted out of the action verbatim; the caller keeps the
 * `if (!data.ready)` test so the control flow reads unchanged at the call site.
 *
 * 🚨 IT RETURNS THE CODE AND THE CALLER ASSIGNS IT. `process.exitCode =
 * reportChannelSetupNotReady(…)` at the call site, never an assignment in here.
 * Both spellings end the process the same way, so nothing about the behaviour
 * picks between them — what picks is that the exit has to stay VISIBLE inside
 * the action body:
 *
 *   · `status-verdict.scan.ts` reads the three forms in `isExitPath` — an
 *     assignment to `process.exitCode`, `process.exit(…)`, a `throw` — and
 *     deliberately does NOT follow a helper by name, because blessing a name
 *     would legalise a check verb that calls `reportFailure(…)` as a bare
 *     statement and still exits 0. An assignment in here is invisible to it,
 *     so `channel setup`'s `ready` and `status` read as verdicts printed over
 *     an exit code of 0 — a false finding against a ledger whose ceiling is 0;
 *   · it is the convention every correct site in this package already follows,
 *     and `reportFailure` is built for it: it PRINTS the error document and
 *     RETURNS the code, touching `process.exitCode` never.
 *
 * `channel-setup-verdict-exits.test.ts` is the behavioural half, and it holds
 * either way — which is exactly why the scan is the instrument that notices.
 */
// 🚨 `ready` IS THE ONE FACT THIS COMMAND EXISTS TO REPORT, and its own
// --help published the workaround for the exit code not carrying it:
// `nexus channel setup --type WHATSAPP --json | jq -e '.ready'`. A
// documented workaround for an exit code is the confession.
//
// ⚠️ THE REFUSAL CLAIMS NOTHING ABOUT WHAT WAS VERIFIED. `ready: true`
// is not a check for every `--type` — a type with no real prerequisites
// reports true having verified nothing, and the help says so. So only
// the FALSE arm is new; the success path makes no claim it did not make
// before.
//
// `remote-error`, never a refusal of the command line: the invocation
// was ACCEPTED and the platform answered that the prerequisites are not
// met. `outcome-not-reached` was considered and rejected — its own
// declaration is "here something changed and it was not enough", and a
// `channel setup` without `--auto` changes nothing at all.
export function reportChannelSetupNotReady(data: ChannelSetupResponse, type: string): number {
  // 🚨 UNDER --json A FAILURE IS THE ERROR DOCUMENT AND NOTHING ELSE.
  // Printing the steps and then refusing takes stdout with a document
  // that parses cleanly and never says the channel is not ready —
  // `error-masked` in `json-one-document.scan.ts`, whose ceiling is 0.
  //
  // So the CHECKLIST MOVES INTO THE MESSAGE rather than being lost. Same
  // construction as `external-tool/spec-breaking-change.report.ts`,
  // which lists the bindings it is refusing over inside the one document
  // a `--json` caller gets. A human keeps the table above it.
  if (!isJsonMode()) {
    printTable(data.steps, SETUP_STEP_COLUMNS);
  }
  const blocking = data.steps.find((step) => step.status === "action_needed");
  return reportFailure(
    "remote-error",
    [
      `Channel setup for ${type} is NOT ready.`,
      ...data.steps.map((step) => `  ${String(step.step)}. ${step.label} — ${step.status}`)
    ].join("\n"),
    // 🚨 THE ACTION TRAVELS IN THE HINT, IT IS NOT POINTED AT. This
    // document REPLACES the steps under --json, so a hint saying "read
    // action.endpoint with --json" would name a field that is no longer
    // there — a hint that sends the reader to nothing, on the one path
    // where the next step is the whole point.
    //
    // THIS STOPS AT THE FIRST GAP — every step after the blocking one
    // reads "pending" whatever its real state is, so naming the first one
    // is naming the only actionable fact there is.
    blocking === undefined
      ? "No step reports action_needed, so the platform is reporting not-ready for a reason this checklist does not name."
      : [
          `Next: ${blocking.label} — ${blocking.description}`,
          ...(blocking.action === undefined
            ? []
            : [
                `  ${blocking.action.method} ${blocking.action.endpoint}`,
                ...(blocking.action.hint === undefined ? [] : [`  ${blocking.action.hint}`])
              ])
        ].join("\n")
  );
}

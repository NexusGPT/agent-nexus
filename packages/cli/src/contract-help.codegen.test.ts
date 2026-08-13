import { describe, expect, it } from "vitest";

import { constNameFor, renderGeneratedModule } from "./contract-help.codegen";
import type { ProjectedDescriptor, ProjectedField } from "./contract-help.render";

/**
 * THE NAME THIS CODEGEN EMITS IS A TYPESCRIPT IDENTIFIER, AND A CONTRACT KEY IS
 * NOT.
 *
 * `constNameFor` rewrote `[]`, dots, whitespace and camel humps, and every path
 * it had ever been handed happened to contain nothing else — so it produced a
 * legal name by the shape of the contract rather than by construction. The first
 * ledger descriptor to break that was `ChannelWhatsappTemplateCreate`, whose
 * Twilio type keys are `twilio/call-to-action` and `twilio/carousel`. The slash
 * came through verbatim:
 *
 *     export const CHANNEL_..._TWILIO/CALL-TO-ACTION_ACTIONS_ITEM_TYPE = {
 *
 * ⚠️ AND THE GENERATOR WRITES BEFORE IT VERIFIES, DELIBERATELY, so the broken
 * module reached disk first and the run then died inside esbuild with
 * `Expected ";" but found "/"` at a line and column — no namespace, no
 * descriptor, no field. A generator whose refusals are otherwise argued in full
 * sentences failed here as a parse error in a file nobody edits.
 *
 * Flattening every stray character to `_` fixes that and buys a second failure:
 * `a/b` and `a-b` now both become `A_B`. That one is SILENT — two fields emit one
 * `export const`, the later declaration wins, and the flag bound to the earlier
 * field is offered the other field's values with generated authority behind it.
 * So the two are tested together: the fix, and the hole the fix opens.
 */

const field = (path: string, enumValues?: readonly string[]): ProjectedField => ({
  path,
  slot: "Body",
  type: "string",
  required: true,
  depth: 0,
  ...(enumValues ? { enumValues } : {})
});

const descriptor = (name: string, fields: readonly ProjectedField[]): ProjectedDescriptor => ({
  name,
  method: "POST",
  route: "/public/v1/probe",
  fields
});

/** Every `export const <NAME>` the rendered module declares. */
function exportedNames(module: string): string[] {
  return [...module.matchAll(/^export const (\S+) = \{/gm)].map((match) => match[1]);
}

describe("constNameFor produces a legal identifier, whatever the contract key is", () => {
  it("keeps the shape it always had for an ordinary path", () => {
    // The control. The sanitisation must not rewrite a name that was already
    // fine — every committed generated file is full of these, and a change here
    // would show up as a repository-wide diff rather than as a bug.
    expect(constNameFor("AnalyticsQueryStructured", "Body.filters[].op")).toBe(
      "ANALYTICS_QUERY_STRUCTURED__BODY_FILTERS_ITEM_OP"
    );
  });

  it("flattens a slash and a hyphen, which a real contract key contains", () => {
    expect(
      constNameFor(
        "ChannelWhatsappTemplateCreate",
        "Body.types.twilio/call-to-action.actions[].type"
      )
    ).toBe("CHANNEL_WHATSAPP_TEMPLATE_CREATE__BODY_TYPES_TWILIO_CALL_TO_ACTION_ACTIONS_ITEM_TYPE");
  });

  it("emits nothing outside [A-Z0-9_] for a deliberately hostile key", () => {
    const name = constNameFor("Probe", "Body.a b/c-d.e@f+g.h[].i");
    expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

describe("the module refuses a name it cannot emit safely", () => {
  it("renders an ordinary namespace without complaint", () => {
    // 🚨 THE FALSE-POSITIVE DIRECTION, and it is the one that decides whether
    // this guard survives. A refusal that fires on correct work gets deleted,
    // and then the real collisions flow again.
    const module = renderGeneratedModule("probe", [
      descriptor("ProbeCreate", [field("Body.kind", ["a", "b"]), field("Body.name")]),
      descriptor("ProbeList", [field("Params.status", ["OPEN"])])
    ]);
    expect(exportedNames(module)).toEqual([
      "PROBE_CREATE__BODY_KIND",
      "PROBE_LIST__PARAMS_STATUS",
      "PROBE_CREATE_CONTRACT",
      "PROBE_LIST_CONTRACT"
    ]);
  });

  it("refuses two distinct contract fields that flatten to one name", () => {
    // The hole the sanitisation opens, closed. `twilio/text` and `twilio-text`
    // are different keys and one const cannot serve both.
    expect(() =>
      renderGeneratedModule("probe", [
        descriptor("ProbeCreate", [
          field("Body.types.twilio/text.kind", ["a"]),
          field("Body.types.twilio-text.kind", ["b"])
        ])
      ])
    ).toThrow(/one const for 1 set\(s\) of distinct contract fields/);
  });

  it("names both colliding contract paths in the refusal", () => {
    // A refusal naming only the const would send a reader to a generated file to
    // work out which two fields made it. Both paths are the whole message.
    let message = "";
    try {
      renderGeneratedModule("probe", [
        descriptor("ProbeCreate", [
          field("Body.types.twilio/text.kind", ["a"]),
          field("Body.types.twilio-text.kind", ["b"])
        ])
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("ProbeCreate.Body.types.twilio/text.kind");
    expect(message).toContain("ProbeCreate.Body.types.twilio-text.kind");
  });

  it("checks the SHAPE consts too, not only the enum ones", () => {
    // A descriptor with no enum contributes no enum const, so a guard walking
    // only the enum list would render these two into one `PROBE_ONE_CONTRACT`
    // and say nothing.
    //
    // ⚠️ AN ENUM CONST AND A SHAPE CONST CANNOT COLLIDE WITH EACH OTHER, and the
    // guard is not claiming they can: an enum name always carries the `__`
    // separator and a shape name never does. Both are in one list because that
    // is the scope a module actually has, not because the cross pair is
    // reachable. What IS reachable is this pair.
    expect(() =>
      renderGeneratedModule("probe", [
        descriptor("Probe/One", [field("Body.name")]),
        descriptor("Probe-One", [field("Body.name")])
      ])
    ).toThrow(/PROBE_ONE_CONTRACT/);
  });

  it("every committed generated module would still render", () => {
    // The negative control's twin, stated as a property rather than a fixture:
    // an emitted name that is not a legal identifier is refused, so a green
    // `gen:contract-help` over the real 39 namespaces IS the evidence that none
    // of them collides. Asserted here on the shape most likely to break it.
    const module = renderGeneratedModule("channel", [
      descriptor("ChannelWhatsappTemplateCreate", [
        field("Body.types.twilio/call-to-action.actions[].type", ["URL", "PHONE_NUMBER"]),
        field("Body.types.twilio/carousel.cards[].actions[].type", ["QUICK_REPLY", "URL"])
      ])
    ]);
    for (const name of exportedNames(module)) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });
});

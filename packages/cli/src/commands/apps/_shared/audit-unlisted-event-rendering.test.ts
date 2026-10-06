import { describe, expect, it } from "vitest";

import { VIBE_AUDIT_EVENT_TYPES } from "../../../vibe-audit-event-types.generated";
import type { AuditPayloadUnlisted } from "../../../vibe-audit-wire-types";
import { colorizeEventType } from "./colorize-event-type";
import { formatPayloadDetails } from "./format-payload-details";

/**
 * A published CLI talks to backends newer than itself, so `apps audit list`
 * routinely receives an event type this binary does not list. It must print the
 * server's own word — before this, `colorizeEventType` fell through every `case`
 * of its tone switch and the table printed the string `undefined`.
 *
 * Derived from the generated list rather than coined: a coined literal can become
 * a real event type later and silently turn these into listed-row tests.
 */
const UNLISTED_EVENT_TYPE = `${VIBE_AUDIT_EVENT_TYPES.join("_")}_UNLISTED`;

const TRIGGER_SHA = "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b";

describe("colorizeEventType — an event type this CLI does not list", () => {
  it("precondition: the fixture's type really is unlisted", () => {
    const listed: readonly string[] = VIBE_AUDIT_EVENT_TYPES;

    expect(listed.length).toBeGreaterThan(0);
    expect(listed.includes(UNLISTED_EVENT_TYPE)).toBe(false);
  });

  it("returns a string carrying the raw event type", () => {
    const rendered: unknown = colorizeEventType(UNLISTED_EVENT_TYPE);

    expect(typeof rendered === "string" && rendered.includes(UNLISTED_EVENT_TYPE)).toBe(true);
  });

  it("never renders the word undefined", () => {
    expect(String(colorizeEventType(UNLISTED_EVENT_TYPE))).not.toContain("undefined");
  });

  it("control: a listed type still renders as itself, so the haystack above can carry a type", () => {
    const [listed] = VIBE_AUDIT_EVENT_TYPES;

    expect(String(colorizeEventType(listed))).toContain(listed);
  });
});

describe("formatPayloadDetails — a payload whose event type this CLI does not list", () => {
  const payload: AuditPayloadUnlisted = {
    eventType: UNLISTED_EVENT_TYPE,
    errorReason: "node pool could not grow",
    triggerSha: TRIGGER_SHA
  };

  it("renders the server's errorReason", () => {
    expect(formatPayloadDetails(payload)).toContain('errorReason="node pool could not grow"');
  });

  it("renders the server's triggerSha, shortened", () => {
    expect(formatPayloadDetails(payload)).toContain(`sha=${TRIGGER_SHA.slice(0, 7)}`);
  });
});

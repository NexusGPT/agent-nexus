import { describe, expect, it } from "vitest";

import {
  type AuditPayloadMalformed,
  isAuditEventType,
  isListedAuditPayload
} from "../../../vibe-audit-wire-types";
import { formatPayloadDetails } from "./format-payload-details";

/**
 * A row whose stored payload does not fit its own LISTED event type arrives as a
 * malformed payload: the listed type, and none of that type's fields at the top
 * level. Treated as listed, the printer would run that type's own `case`, which
 * reads fields that are not there.
 */
const LISTED_TYPE = "DEPLOYMENT_TRIGGERED";

const MALFORMED: AuditPayloadMalformed = {
  eventType: LISTED_TYPE,
  malformedPayload: {
    raw: {
      eventType: LISTED_TYPE,
      triggerSha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      approvalGated: false
    },
    issuePaths: ["vibeDeploymentId"]
  }
};

describe("formatPayloadDetails — a malformed payload of a LISTED type", () => {
  it("precondition: the payload's event type is one this CLI lists", () => {
    expect(isAuditEventType(LISTED_TYPE)).toBe(true);
  });

  it("isListedAuditPayload is false for it", () => {
    expect(isListedAuditPayload(MALFORMED)).toBe(false);
  });

  it('renders "malformed payload"', () => {
    expect(formatPayloadDetails(MALFORMED)).toContain("malformed payload");
  });

  it("renders the issue path", () => {
    expect(formatPayloadDetails(MALFORMED)).toContain("vibeDeploymentId");
  });

  it("does not render the listed type's own sentence (no sha=)", () => {
    expect(formatPayloadDetails(MALFORMED)).not.toContain("sha=");
  });

  it("control: a valid payload of the same type does render its sentence, so sha= can appear", () => {
    expect(
      formatPayloadDetails({
        eventType: LISTED_TYPE,
        vibeDeploymentId: "33333333-3333-4333-8333-333333333333",
        triggerSha: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
        approvalGated: false
      })
    ).toContain("sha=1a2b3c4");
  });
});

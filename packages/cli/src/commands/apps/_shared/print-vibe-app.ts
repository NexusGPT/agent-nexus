import { isJsonMode, printRecord } from "../../../output";
import { type VibeAppDto, type VibeAppEnvelopeExtras } from "../../../vibe-wire-types";
import {
  envelopeFields,
  identityFields,
  policyFields,
  presentationFields,
  runtimeFields,
  timestampFields,
  type VibeAppRow
} from "./vibe-app-fields";

export function printVibeApp(app: VibeAppDto, extras?: VibeAppEnvelopeExtras): void {
  if (isJsonMode()) {
    // Merged rather than nested: this command has always printed the app at the
    // top level, so `{ ...app }` keeps every existing key exactly where a script
    // already reads it and the joins arrive as purely additive siblings.
    console.log(JSON.stringify({ ...app, ...extras }, null, 2));
    return;
  }

  const row: VibeAppRow = { ...app, ...extras };
  // Section order IS the printed order. `envelopeFields` returns [] when the
  // envelope carried no joins, so the two join rows simply do not appear rather
  // than printing an absence the read never established.
  printRecord(row, [
    ...identityFields(),
    ...envelopeFields(extras),
    ...policyFields(app),
    ...presentationFields(),
    ...runtimeFields(app),
    ...timestampFields()
  ]);
}

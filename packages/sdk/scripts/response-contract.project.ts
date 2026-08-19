import {
  JSON_TYPE_CODES,
  projectV1ResponseShapes,
  type V1PayloadShape,
  type V1RouteShape
} from "../../types/src/api/public/v1/response-shape";
import type { PayloadShape, RouteShape, RouteShapeManifest } from "../src/response-contract";
import type { Equals, Expect } from "../src/v1-contract-equality";

/**
 * Render `response-contract.generated.ts` from the published v1 contract.
 *
 * ## Why this file carries the `.conformance.ts` suffix
 *
 * It imports `@nexus/types`, and `wire-types-bundle.test.ts` refuses that
 * import from any file the published package can reach. The suffix is what
 * makes it unpublishable — matched by SUFFIX rather than by an allowlist, so
 * this file is outside the bundle by construction rather than by a name someone
 * remembered to add.
 *
 * That constraint is the reason the manifest is GENERATED rather than computed.
 * `@nexus/types` pulls Zod and the generated Prisma enums, Zod does not resolve
 * from this package at all, and a consumer installing `@agent-nexus/sdk` from
 * npm has neither. The schemas cannot travel; their projected shape can, as
 * plain data with no imports.
 *
 * ## What the generated module is, and is not
 *
 * It is DATA. It contains no logic, no import, and nothing from `@nexus/types`.
 * The checker that reads it lives in `response-contract.ts` and is ordinary
 * JavaScript.
 */

/**
 * Fails to COMPILE if the SDK's own copy of the manifest types drifts from the
 * projection's.
 *
 * The SDK cannot import those types — the same bundle rule that governs this
 * file — so it declares its own. Two declarations are two things that can
 * drift, and a drift would be invisible at run time: the generated file still
 * parses, and the checker reads fields that are no longer there.
 *
 * 🚨 **`type X = A extends B ? true : never` DOES NOT FAIL.** That was the first
 * spelling of this pair, and it was decorative: a type alias resolving to
 * `never` is a perfectly legal alias, nothing consumes it, and `tsc` says
 * nothing. The claim has to sit in a CONSTRAINT for the compiler to check it,
 * which is what `Expect<T extends true>` is for — the idiom
 * `v1-contract-equality.ts` already exists to provide.
 *
 * `Equals` rather than `extends`, for the reason stated in that module: mutual
 * assignability passes for types differing only in OPTIONALITY, and passes when
 * either side is `any` — which would make this vacuous the moment `@nexus/types`
 * stopped resolving.
 */
export type ManifestPayloadTypesAgree = Expect<Equals<V1PayloadShape, PayloadShape>>;
export type ManifestRouteTypesAgree = Expect<Equals<V1RouteShape, RouteShape>>;

/**
 * The projector's letter alphabet, re-exported so the gate can compare it to
 * the checker's hand-copy.
 *
 * Exporting it is not the check — that was the first version, and an exported
 * constant nothing reads proves nothing. `response-contract.codegen.test.ts`
 * consumes this.
 */
export const PROJECTED_TYPE_CODES = JSON_TYPE_CODES;

/** Build the manifest the SDK ships, plus the numbers a gate asserts about it. */
export function projectResponseContract(): {
  manifest: RouteShapeManifest;
  declared: number;
  undeclared: number;
  opaque: number;
  unprojectable: Readonly<Record<string, string>>;
} {
  const report = projectV1ResponseShapes();
  const manifest: Record<string, RouteShape> = {};
  let declared = 0;
  let undeclared = 0;
  let opaque = 0;

  for (const key of Object.keys(report.routes).sort()) {
    const route = report.routes[key];
    manifest[key] = route;
    if (route.payload.kind === "undeclared") undeclared++;
    else if (route.payload.kind === "opaque") opaque++;
    else declared++;
  }

  return { manifest, declared, undeclared, opaque, unprojectable: report.unprojectable };
}

/** Serialize one shape as source, keys sorted so the output is stable. */
function renderPayload(payload: PayloadShape): string {
  if (payload.kind === "object") {
    const fields = Object.keys(payload.fields)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${JSON.stringify(payload.fields[key])}`)
      .join(",");
    const required = JSON.stringify([...payload.required].sort());
    return `{kind:"object",fields:{${fields}},required:${required}}`;
  }
  if (payload.kind === "array") {
    return `{kind:"array",items:${renderPayload(payload.items)}}`;
  }
  return `{kind:${JSON.stringify(payload.kind)},why:${JSON.stringify(payload.why)}}`;
}

/** The full text of `response-contract.generated.ts`. */
export function renderResponseContractModule(): string {
  const { manifest, declared, undeclared, opaque } = projectResponseContract();

  const entries = Object.keys(manifest)
    .sort()
    .map((key) => {
      const route = manifest[key];
      return (
        `  ${JSON.stringify(key)}: {name:${JSON.stringify(route.name)},` +
        `method:${JSON.stringify(route.method)},path:${JSON.stringify(route.path)},` +
        `payload:${renderPayload(route.payload)}}`
      );
    })
    .join(",\n");

  return `// GENERATED FILE — DO NOT EDIT.
// Regenerate with: pnpm --filter @agent-nexus/sdk run gen:response-contract
//
// The published shape of every Public API v1 response, projected from the Zod
// schemas in \`@nexus/types\` down to plain data that carries no dependency.
// \`response-contract.ts\` reads it; \`response-contract.project.conformance.ts\`
// writes it; \`response-contract.codegen.test.ts\` refuses a stale copy.
//
// Field types are a sorted string of letters — s string, n number, b boolean,
// o object, a array, 0 null. An EMPTY string is the projection declining to
// make a claim, and matches every value.
//
// ${Object.keys(manifest).length} routes: ${declared} with a checkable shape, ${undeclared} publishing no
// response schema, ${opaque} whose payload has no key set to check.

import type { RouteShapeManifest } from "./response-contract";

export const V1_RESPONSE_CONTRACT: RouteShapeManifest = {
${entries}
};
`;
}

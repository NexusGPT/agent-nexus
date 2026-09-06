/**
 * The published v1 response contract, as its own entry point.
 *
 * ## Why this is a subpath and not part of the main entry
 *
 * `V1_RESPONSE_CONTRACT` is a data table describing every route the Public API
 * v1 publishes. It is the largest single thing this package contains — larger
 * than the whole of the rest of the client put together — and it is read by
 * exactly one code path: {@link HttpClientOptions.onResponseContract}, an
 * opt-in diagnostic that most consumers never install.
 *
 * While `http-client.ts` imported it directly, every consumer paid for it
 * whether or not they had a reporter — a browser bundle embedding this client
 * for a chat widget shipped the shape of 470 routes it can never call, to run a
 * check it never asked for. Bundlers cannot drop it: the import is static, the
 * value is reachable from a live branch, and nothing about it is provably dead.
 *
 * So the manifest is DATA the caller supplies, not data the client carries:
 *
 * ```ts
 * import { NexusClient } from "@agent-nexus/sdk";
 * import { V1_RESPONSE_CONTRACT } from "@agent-nexus/sdk/v1-response-contract";
 *
 * const client = new NexusClient({
 *   apiKey,
 *   responseContract: V1_RESPONSE_CONTRACT,
 *   onResponseContract: (report) => {
 *     if (report.state === "mismatch") console.warn(formatContractReport(report));
 *   }
 * });
 * ```
 *
 * Two options rather than one, and deliberately so. `onResponseContract` says
 * where verdicts go; `responseContract` says what to check against. Keeping them
 * separate is what lets a caller check against a manifest that is NOT this one —
 * a pinned older copy, or a projection of a private deployment's own routes —
 * which was impossible while the table was compiled in.
 *
 * ## Why a subpath rather than a second package
 *
 * The manifest is a projection of the same commit's v1 schemas, so it must move
 * in lockstep with the client that consumes it. A separate package introduces a
 * version pair that can skew, and a skew here is silent: an older manifest
 * against a newer client reports drift on routes that did not drift. One
 * package, one version, one publish — and a consumer who never writes the import
 * never receives the bytes.
 *
 * The generated module keeps its own path (`./response-contract.generated`)
 * because three gates read it there. This file is the PUBLIC name for it, and
 * the one tsup builds as a second entry.
 */
export type { RouteShapeManifest } from "./response-contract";
export { V1_RESPONSE_CONTRACT } from "./response-contract.generated";

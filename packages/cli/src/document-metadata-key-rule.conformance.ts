/**
 * The metadata key rule as the Public API v1 contract declares it.
 *
 * `util/metadata.ts` carries a copy of this rule, because the published CLI
 * cannot import `@nexus/types` at runtime: `wire-types-bundle.test.ts` allows
 * the import only in a `*.conformance.ts` module, which the binary never
 * reaches. `metadata-key-rule-matches-the-contract.test.ts` holds the copy
 * against these two values.
 */
export {
  DOCUMENT_METADATA_KEY_PATTERN,
  DOCUMENT_METADATA_KEY_RULE
} from "@nexus/types/public-api-v1";

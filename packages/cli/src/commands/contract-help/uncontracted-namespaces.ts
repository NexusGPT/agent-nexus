export interface UncontractedNamespace {
  /** The top-level command name, e.g. `upgrade`. */
  readonly namespace: string;
  /**
   * The path prefix its leaves DO call, or `"(no network)"`. This is the
   * checkable half: a scanner can assert no leaf under `namespace` resolves to a
   * `/public/v1` route, which is the whole claim.
   */
  readonly surface: string;
  /** Why the contract has nothing to say here, for a reader. */
  readonly because: string;
}

/**
 * NAMESPACES WITH NO CONTRACT TO DERIVE FROM — the shape `BlockedReason` cannot
 * express, and deliberately not forced into it.
 *
 * Every member of that union is a statement ABOUT A DESCRIPTOR: this enum has no
 * flag, that union is open, this projection is empty. A namespace whose leaves
 * call no v1 route at all has no descriptor to make the statement about, so a
 * `BLOCKED_DESCRIPTORS` record would have to invent a `descriptor` key —
 * `projectDescriptor` throws on a name `ZPublicApiV1` does not hold, which would
 * take the audit down rather than record anything.
 *
 * ⚠️ THE DISTINCTION IS NOT PEDANTRY, BECAUSE THE TWO HAVE DIFFERENT FUTURES. A
 * `no-flag-and-no-body` record clears when somebody adds a flag. `upgrade` never
 * clears — it drives npm. `api` clears only if the CLI learns to project the
 * contract for a path typed at RUNTIME, which is a feature, not a binding.
 *
 * 🚨 IT IS NOT A CLAIM THAT THE CONTRACT DECLARES NOTHING BY THIS NAME.
 * `ZPublicApiV1` holds `ClaudeCodeSkillDownload` and `ClaudeCodeSkillExists`;
 * the CLI's `claude-code` namespace calls neither. It reads the unauthenticated
 * `/api/cli/skills` routes, which sit outside `/api/public/v1`, and falls back to
 * a bundle compiled into the binary. Server routes with no CLI caller are the
 * audit's own first exclusion, and this const records the same fact from the
 * command side.
 */
export const UNCONTRACTED_NAMESPACES: readonly UncontractedNamespace[] = [
  {
    namespace: "admin",
    surface: "/api/admin/",
    because:
      "platform-operator routes behind AdminPermissionGuard and a Clerk JWT. They " +
      "bypass the SDK's /api/public/v1 prefix entirely — see util/admin-http.ts — " +
      "so ZPublicApiV1 declares no descriptor for any of them."
  },
  {
    namespace: "api",
    surface: "/api/public/v1 + a path typed at runtime",
    because:
      "THE ONE MEMBER HERE THAT DOES CALL v1, AND IT IS STILL UNBINDABLE. Method " +
      "and path are POSITIONAL ARGUMENTS, so the descriptor is chosen by the " +
      "operator after the binary starts. `bindCommand` takes one shape at " +
      "registration time and there is no shape to take. Reaching it means " +
      "resolving a typed path to a descriptor at runtime, which is a feature."
  },
  {
    namespace: "claude-code",
    surface: "/api/cli/skills, unauthenticated",
    because:
      "installs the latest skills corpus from GET /api/cli/skills/manifest and " +
      "/api/cli/skills/:commitSha/corpus — routes outside /api/public/v1 that take " +
      "no API key, contracted by ZCliSkills rather than ZPublicApiV1 — and falls " +
      "back to src/skills-content.generated.ts, compiled into the binary. The " +
      "contract's own ClaudeCodeSkillDownload and ClaudeCodeSkillExists routes " +
      "have no caller here."
  },
  {
    namespace: "mcp",
    surface: "/api/public/v1/mcp, as a JSON-RPC 2.0 envelope",
    because:
      "the SECOND member here that does call v1, and unbindable for a different " +
      "reason from `api`. `McpRpc` is a TRANSPORT descriptor: its Body is the " +
      "JSON-RPC envelope — jsonrpc, id, method, params — and `params` is " +
      "deliberately `z.unknown()`, because its shape is decided by `method`, " +
      "which the envelope does not know. So the contract projects no field a " +
      "flag could carry and declares no enum: `--input` fills `params.arguments`, " +
      "whose schema is the TOOL's `inputSchema`, generated server-side at request " +
      "time and printed by `nexus mcp tools get`. The SDK excludes it for the " +
      "same reason — see `v1-routes-have-an-sdk-method.test.ts`."
  },
  {
    namespace: "skills",
    surface: "/api/cli/skills, unauthenticated",
    because:
      "the same installer and the same corpus source as claude-code, wrapped in " +
      "project-root detection. No API key; --bundled makes no network call at all."
  },
  {
    namespace: "upgrade",
    surface: "npm registry + a global package-manager install",
    because:
      "manages the local CLI install. Its --help states it needs no API key, no " +
      "base URL and no profile. It answers to update, latest and up as declared " +
      "aliases, which register no namespace of their own and are not separate " +
      "top-level names either. The namespace total is NAMESPACE_TOTAL in test/" +
      "unit/help-truth.ledger.ts, where a test pins it to the live tree; a " +
      "number written here would be prose that nothing can redden, and the two " +
      "that used to be here had both gone stale."
  }
];

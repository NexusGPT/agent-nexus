import type { NexusApiError } from "@agent-nexus/sdk";

/**
 * What the CLI can offer for a specific API error code.
 *
 * The API's message names the CONDITION in surface-neutral terms, because the
 * console renders the very same string — a message that said "run nexus ..."
 * would name a control a browser user does not have. The command that resolves
 * it therefore belongs here, on the surface that knows the reader is in a
 * terminal. Keyed by the error CODE, never by message text, so rewording the
 * API's prose cannot silently drop the next step.
 */
const NEXT_STEPS_BY_CODE: Record<string, string> = {
  // The org has no dedicated cluster (or its cluster cannot host code). Two
  // ways forward, and the second is the one nobody guesses: a project that
  // carries its own remote is cloned straight from there by the build and
  // never needs a cluster at all.
  VIBE_GIT_PROJECT_CLUSTER_NOT_READY: [
    "Provision your cluster (EU regions, immutable once set):",
    "  nexus apps cluster provision --region eu-west-3",
    "  nexus apps cluster status",
    "",
    "Or host the code yourself — no cluster needed, the build clones your remote:",
    "  nexus apps provision-repo <appId> --git-url https://github.com/acme/svc.git"
  ].join("\n"),

  // The host index is global, so the holder may be another organization — the
  // server names no holder and neither does this. Two cases a reader can act on
  // from here: it is one of their own apps, or it is not.
  VIBE_APP_DOMAIN_ALREADY_ATTACHED: [
    "A host can serve one app at a time, in any organization. If it is on one of",
    '  your own apps, find it with "nexus apps domains list <appId>" and detach it',
    '  there with "nexus apps domains remove". Otherwise whoever holds it has to',
    "  release it first.",
    "",
    "  Owning the domain at your DNS provider does not release it here."
  ].join("\n"),

  VIBE_APP_DOMAIN_NOT_PRIMARY_ELIGIBLE: [
    "Only an ACTIVE domain can be primary. Check where it stands:",
    "    nexus apps domains list <appId>",
    "  and move a PENDING_DNS one along with:",
    "    nexus apps domains verify <appId> <host>"
  ].join("\n"),

  // The id names a real connected account under its OTHER name. Two commands
  // print an `ID` column for one account — "tool credentials" the tool-scoped
  // `ToolCredentials.id`, "credential list" the unified `Credential.id` — both
  // UUIDs, and neither namespace accepts the other's. The API's message already
  // names the unified id; what belongs here is the reason the two exist and
  // which command prints which, because a bare 404 on the pre-delete check
  // "credential delete --help" mandates otherwise reads as "already deleted".
  // Continuation lines carry their own two spaces: `printCliError` indents the
  // FIRST line of a hint and no others, so a multi-line block that does not
  // indent itself renders ragged against the message above it.
  CREDENTIAL_ID_IS_TOOL_SCOPED: [
    'That id is the one "nexus tool credentials <tool-id>" prints. It is TOOL-SCOPED,',
    '  and only "nexus tool delete-credential" takes it.',
    "",
    "  A refusal here is NOT proof the credential is gone — the same account is",
    "  alive under the unified id the message above names.",
    "",
    '  "credential" and "access-card" take that unified id. List them with:',
    "    nexus credential list"
  ].join("\n")
};

/**
 * The CLI-actionable next step for an API error, or null when we have nothing
 * better to say than the API already did. A code the API sends but this table
 * does not know is not an error — the caller still gets the API's message.
 */
export function nextStepsFor(err: NexusApiError): string | null {
  return NEXT_STEPS_BY_CODE[err.code] ?? null;
}

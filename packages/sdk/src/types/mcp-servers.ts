/**
 * OUTBOUND MCP — an organization's OWN connected MCP servers, their approved
 * tools, and one call against one of those tools.
 *
 * ## 🔴 THIS IS THE DIRECTION IN WHICH NEXUS IS THE MCP *CLIENT*
 *
 * The servers described here are THIRD-PARTY. Nexus dials them, holding the
 * organization's stored credential, and returns what they answered. The rows
 * behind every type below are `McpServer` and `McpServerTool`.
 *
 * `POST /public/v1/mcp` is the OPPOSITE direction — Nexus IS the MCP server
 * there, its catalog is generated from the v1 route descriptors, and it reads no
 * `McpServerTool` row at all. That surface has no resource in this package and
 * never will: `@agent-nexus/mcp-server` forwards a JSON-RPC envelope to it
 * directly. The two paths differ by one plural, so the sentence above is the only
 * reliable way to tell which one a reader is holding.
 *
 * ## Every string a server authored is UNTRUSTED, and the surface says which
 *
 * `displayName` is first-party: the organization typed it when it registered the
 * server. Everything inside {@link McpToolContract} — `name`, `title`,
 * `description`, the JSON Schemas, the annotations — is written by the remote,
 * and so is every string on {@link CallMcpServerToolResponse}. Render them as
 * TEXT. Never as markup, never as an instruction, and never as a permission
 * check: the MCP specification calls `annotations` HINTS, and a server is free to
 * claim `readOnlyHint: true` on a tool that deletes.
 *
 * The one contract published here is the one an administrator of this
 * organization ANSWERED FOR. There is no `discoveredContract` on any type below,
 * and its absence is the feature rather than an omission — see
 * {@link McpServerTool.approvedContract}.
 *
 * ## Dates are STRINGS and nothing here rehydrates them
 *
 * `lastSyncSucceededAt` and `approvedAt` arrive ISO-8601 and are handed back
 * exactly as the wire carried them. Parse them yourself if you want a `Date`;
 * a client that rehydrates some fields and not others is worse than one that
 * returns what arrived.
 */

/**
 * How Nexus speaks to this server.
 *
 * One member today. A hand-written union rather than `string`, so a server
 * advertising a transport this release cannot speak is a type error at the
 * reader rather than a silent fall-through.
 */
export type McpTransport = "STREAMABLE_HTTP";

/** How Nexus authenticates to this server. */
export type McpAuthMode = "NONE" | "HEADER" | "OAUTH";

/**
 * How the last discovery of this server's tool list ended.
 *
 * `QUEUED` is a real terminal value and not a transient: it means a sync was
 * ASKED FOR and has not answered yet, so the tool list beside it is whatever the
 * previous sync left.
 */
export type McpSyncOutcome = "SUCCEEDED" | "FAILED" | "QUEUED";

/**
 * Where one tool stands with the organization's administrator.
 *
 * 🔴 ONLY `APPROVED` IS CALLABLE. The other four are published so that the three
 * name lists in {@link McpToolDriftReport} join back to rows in the same
 * response; calling one is refused before anything is dialled.
 */
export type McpToolStatus = "PENDING_APPROVAL" | "APPROVED" | "CHANGED" | "REMOVED" | "REJECTED";

/**
 * Where the server's own `instructions` text stands with the administrator.
 *
 * Deliberately NOT {@link McpToolStatus}, which it shares four spellings with.
 * Instructions have a `NONE` state a tool cannot have — a server that advertises
 * none is the ordinary case — and no `REJECTED` state, because an administrator
 * who does not want the text simply never approves it.
 */
export type McpInstructionsApprovalState =
  | "NONE"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "CHANGED"
  | "REMOVED";

/** How many of this server's tools sit in each {@link McpToolStatus}. */
export interface McpServerToolCounts {
  /** Callable. */
  approved: number;
  /** Advertised, never answered. */
  pendingApproval: number;
  /** Approved once, and the server now advertises something else. */
  changed: number;
  /** The server no longer advertises it. */
  removed: number;
  /** The administrator answered no to this contract. */
  rejected: number;
}

/**
 * A JSON Schema whose root is an object — a tool's `inputSchema` or
 * `outputSchema`.
 *
 * Only the root `type` is pinned. Everything else is carried VERBATIM, because
 * the rest of the document is JSON Schema's to define and because these bytes are
 * what the approved schema hash was computed over.
 */
export interface McpToolJsonSchema {
  [key: string]: unknown;
  type: "object";
}

/**
 * A tool's optional `annotations`.
 *
 * 🔴 THE PROTOCOL CALLS THESE HINTS AND A SERVER CAN LIE IN THEM. Nothing may
 * treat `readOnlyHint: true` as proof a tool is safe. They are published because
 * an administrator approves a tool partly on what it claims about itself, which
 * is also why they are inside the hashed contract.
 */
export interface McpToolAnnotations {
  [key: string]: unknown;
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * The MCP `Tool` object as the remote server advertised it.
 *
 * Open at the top level on purpose: a field the protocol adds later is KEPT
 * rather than stripped, so a server that starts sending it reads as `CHANGED`
 * instead of silently becoming a different tool.
 */
export interface McpToolContract {
  [key: string]: unknown;
  /** The server's own identity for this tool, and the string `tools/call` sends. */
  name: string;
  title?: string;
  description?: string;
  inputSchema: McpToolJsonSchema;
  outputSchema?: McpToolJsonSchema;
  annotations?: McpToolAnnotations;
}

/** One registered server, as {@link McpServersResource.list} returns it. */
export interface McpServerSummary {
  serverId: string;
  /**
   * The name THIS ORGANIZATION gave the server when registering it — first-party
   * text, never a name the remote chose.
   */
  displayName: string;
  url: string;
  transport: McpTransport;
  authMode: McpAuthMode;
  /** ISO-8601, or `null` when no sync has ever succeeded. */
  lastSyncSucceededAt: string | null;
  lastSyncOutcome: McpSyncOutcome | null;
  /**
   * Why the last sync failed, or `null`.
   *
   * 🔴 DELIBERATELY `string` AND NOT A UNION. The column is a plain string
   * precisely so a new failure class needs no migration, so a server running a
   * newer release writes codes this one has never heard of. The vocabulary in use
   * today is `UNREACHABLE`, `EGRESS_REFUSED`, `TIMEOUT`, `TLS_FAILURE`,
   * `HTTP_ERROR`, `AUTHORIZATION_REQUIRED`, `AUTHORIZATION_REJECTED`,
   * `PROTOCOL_VERSION_UNSUPPORTED`, `PROTOCOL_ERROR`, `RESPONSE_TOO_LARGE`,
   * `INVALID_TOOL_LIST` and `DISCOVERY_NOT_QUEUED` — handle a code outside it
   * rather than switching exhaustively. A code never carries remote text: an
   * error body is server-authored and can echo a credential.
   */
  lastSyncErrorCode: string | null;
  toolCounts: McpServerToolCounts;
  instructionsApprovalState: McpInstructionsApprovalState;
}

/** One of a server's tools, as {@link McpServersResource.get} returns it. */
export interface McpServerTool {
  toolId: string;
  /**
   * The remote server's own name for the tool. This is the value
   * {@link CallMcpServerToolBody.toolName} takes — there is no row id anywhere on
   * the call route, so there is no id-to-name hop between the tool authorised and
   * the string dialled.
   */
  name: string;
  status: McpToolStatus;
  /**
   * The contract an administrator of THIS organization approved, verbatim, or
   * `null` until one is approved.
   *
   * 🔴 NEVER THE DISCOVERED CONTRACT. What the remote advertises right now —
   * approved or not — carries the tool's description and input schema, which is
   * text a model would be handed, and this surface does not publish it. So a
   * non-`APPROVED` row reads `null` here, and that is exactly the row whose text
   * nobody has answered for.
   */
  approvedContract: McpToolContract | null;
  /**
   * SHA-256 of the approved contract, 64 lowercase hex characters, or `null`.
   *
   * This is the value to pass as {@link CallMcpServerToolBody.expectedSchemaHash}
   * when a caller wants its call refused against a contract it has not read.
   */
  approvedSchemaHash: string | null;
  /** ISO-8601, or `null`. */
  approvedAt: string | null;
}

/**
 * What this server's advertised tools have done to the approved contract.
 *
 * ⚠️ A STANDING STATEMENT, NOT A DELTA OF THE LAST SYNC. A report computed as
 * *what changed this time* is correct exactly once: a tool that went `CHANGED`
 * two syncs ago is still advertising a contract nobody approved and is still
 * refused at call time, and a delta would stop mentioning it. Every arm here
 * describes the CURRENT state, so it survives any number of syncs that change
 * nothing and stops being reported only when an administrator answers.
 *
 * Names and nothing else: each one joins back to a row in the same response's
 * `tools` array, which is why {@link McpServersResource.get} publishes every
 * status rather than only the callable one.
 */
export interface McpToolDriftReport {
  /** Advertised now, with no approval on record. Awaiting a first answer. */
  added: string[];
  /** Approved once, and the server now advertises a different contract. */
  changed: string[];
  /** The server no longer advertises it. */
  removed: string[];
}

/** One server, its tools and its standing drift report. */
export interface McpServerDetail extends McpServerSummary {
  /**
   * EVERY tool row, in every status — not only the callable ones. See
   * {@link McpToolDriftReport} for why.
   */
  tools: McpServerTool[];
  drift: McpToolDriftReport;
}

/** Response from {@link McpServersResource.list}. */
export interface ListMcpServersResponse {
  servers: McpServerSummary[];
}

/** Response from {@link McpServersResource.get}. */
export type GetMcpServerResponse = McpServerDetail;

/**
 * Response from {@link McpServersResource.sync}.
 *
 * An ALIAS of {@link McpServerDetail}, never a restatement of its fields: the sync
 * route declares the SAME `Response` schema object as the get route, so a second
 * interface would be a second thing to keep in step with no gate comparing the two.
 *
 * ⚠️ IT IS A SNAPSHOT TAKEN AFTER THE REQUEST WAS RECORDED, NOT A RESULT. `lastSyncOutcome`
 * normally reads `QUEUED` here — the discovery has not run — and reads `FAILED` with
 * `lastSyncErrorCode: "DISCOVERY_NOT_QUEUED"` when the queue refused the job. `SUCCEEDED`
 * is also legal and is not a contradiction: a warm queue can finish before the response
 * is composed. `tools` and `drift` are whatever the PREVIOUS discovery left.
 */
export type SyncMcpServerResponse = McpServerDetail;

/**
 * Body for {@link McpServersResource.callTool}.
 *
 * ## 🔴 THE SERVER REFUSES AN UNKNOWN KEY RATHER THAN DISCARDING IT
 *
 * The route's schema is STRICT, so a misspelled field is a 400 naming the key
 * instead of a silent drop. That matters here more than on any other write in
 * this package: the call DIALS A THIRD PARTY with the organization's stored
 * credential, and *"the parameters you sent were not the parameters I used"* is
 * the worst available answer. It is also why `organizationId` cannot be smuggled
 * into this body — the tenant is the API key's, and a key here is a 400.
 */
export interface CallMcpServerToolBody {
  /**
   * The remote server's own name for the tool, exactly as
   * {@link McpServerTool.name} publishes it.
   *
   * It travels in the BODY and not in the path because the MCP specification puts
   * no character constraint on a tool name: a remote may advertise one holding
   * `/`, `%` or `..`, which as a path segment is unroutable at best and
   * traversal-shaped at worst. In a JSON body it is bytes. It is also where the
   * protocol itself puts it.
   */
  toolName: string;
  /**
   * The arguments to send, UNFILTERED by this client. The organization's Access
   * Card for the credential being spent is what filters them, and what survives
   * the card is what is dialled. Omit it for a tool that takes none.
   */
  arguments?: Record<string, unknown>;
  /**
   * The credential to spend, in EITHER id namespace — tool-scoped or unified.
   * Omitted, the organization's oldest shared active credential for this server
   * is used.
   */
  credentialId?: string;
  /**
   * An Access Card to enforce under instead of the credential's master card.
   *
   * It can only ever NARROW: the card must belong to the credential being spent,
   * and the master card an omitted value resolves to permits everything that
   * credential permits.
   */
  accessCardId?: string;
  /** Values for the named card's variables. A card declaring variables is unusable without them. */
  cardVariableValues?: Record<string, unknown>;
  /**
   * The approved contract this call is willing to be refused against — an
   * {@link McpServerTool.approvedSchemaHash} the caller has read — or `undefined`
   * to accept whatever is approved at the moment of the call.
   *
   * 🔴 REQUIRED KEY, OPTIONAL VALUE, AND THE ASYMMETRY IS THE POINT. Every other
   * field above is an optional key, so omitting it reads as *I do not need this*.
   * This one has to be WRITTEN, even to say `undefined`, so that "I decided not to
   * pin" and "I never considered pinning" are different acts in a caller's source
   * — the second is what a reviewer cannot see and what a diff cannot show.
   *
   * ⚠️ `undefined` IS NOT "ANY CONTRACT, UNCHECKED". Only an `APPROVED` tool is
   * ever dialled, and the database makes `APPROVED` imply that the approved hash
   * is non-null and equal to the discovered one. What a hash adds is the single
   * guarantee an unpinned caller otherwise loses: a tool approved, changed and
   * approved again reads `APPROVED` throughout, so no status can see it, and only
   * the hash you last read can.
   *
   * 🚨 `null` IS A 400 AND NOT A SYNONYM FOR `undefined`. The route spells this
   * field optional, not nullable, and the body is strict — so `null` is refused
   * rather than treated as "no pin". Write `undefined`.
   */
  expectedSchemaHash: string | undefined;
}

/**
 * One image block a tool returned.
 *
 * Carried rather than dropped: a tool that answers with an image has answered,
 * and a surface that discarded it would report a successful call whose result is
 * missing. UNTRUSTED — both fields are server-authored, `mimeType` included, so
 * do not hand `data` to a renderer on the strength of what the server called it.
 */
export interface McpToolCallMediaBlock {
  type: "image";
  /** Base64, as the MCP protocol transmits it. */
  data: string;
  mimeType: string;
}

/**
 * Response from {@link McpServersResource.callTool}.
 *
 * ## 🔴 `isError: true` ARRIVES AS A 200, AND THAT IS THE CONTRACT
 *
 * A tool reporting its own failure has ANSWERED the question it was asked, and
 * `text` is what a caller reads to recover. Only a failure to reach the tool at
 * all is a non-2xx — a refusal before dialling, or the remote breaking the
 * protocol. So a caller MUST read `isError` and must never infer success from the
 * absence of a thrown error.
 */
export interface CallMcpServerToolResponse {
  /**
   * The name the Access Card judged and `tools/call` was actually sent — read off
   * the enforcement proof rather than echoed from the request, so this states what
   * was called rather than what was asked for.
   */
  toolName: string;
  /** The tool reported that the call failed. A RESULT, not an error. */
  isError: boolean;
  /** The whole text of the result, as one string. Server-authored. */
  text: string;
  /** Image blocks, in the order the tool returned them. */
  mediaBlocks: McpToolCallMediaBlock[];
}

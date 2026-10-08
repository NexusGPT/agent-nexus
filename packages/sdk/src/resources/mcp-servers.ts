import type {
  CallMcpServerToolBody,
  CallMcpServerToolResponse,
  GetMcpServerResponse,
  ListMcpServersResponse,
  SyncMcpServerResponse
} from "../types/mcp-servers";
import { BaseResource } from "./base-resource";

/**
 * OUTBOUND MCP — an organization's OWN connected MCP servers. Accessed via
 * `client.mcpServers`.
 *
 * ## 🔴 THE DIRECTION IS THE WHOLE POINT OF THE NAME, AND THE PLURAL IS THE ONLY
 * THING THAT CARRIES IT
 *
 * Here Nexus is the MCP **client**: the servers are third-party, Nexus dials them
 * holding the organization's stored credential, and the rows behind every
 * response are `McpServer` and `McpServerTool`.
 *
 * `POST /public/v1/mcp` — singular — is the OPPOSITE direction, where Nexus IS
 * the MCP server and its catalog is generated from the v1 route descriptors. It
 * has no resource in this package deliberately: `@agent-nexus/mcp-server`
 * forwards a JSON-RPC envelope to it directly, so a typed wrapper would have no
 * caller. A reader holding one of the two cannot tell which from the path alone,
 * which is why this paragraph exists.
 *
 * ## Four methods, and the asymmetry between the reads, the call and the sync
 *
 * `list()` and `get()` answer *what has this organization connected, and what did
 * an administrator approve on it*. `callTool()` dials ONE approved tool, once.
 * `sync()` asks for a server to be dialled again and its tool list reconciled, and
 * is the only one that returns before its work has happened. The organization is the
 * API key's on all four and is a parameter of none.
 *
 * ## 🔴 ONLY AN `APPROVED` TOOL IS CALLABLE, AND THE READS PUBLISH EVERY STATUS
 *
 * `get()` returns tool rows in every {@link McpToolStatus}, not only the callable
 * ones — the three name lists in the server's `drift` report join back to them by
 * name, and publishing only the approved rows would leave `added`, `changed` and
 * `removed` naming tools the caller cannot see at all. It costs no disclosure: a
 * non-approved row carries `approvedContract: null`.
 *
 * So filter on `status === "APPROVED"` before offering a tool to anything. Calling
 * a tool in any other status is refused before a packet leaves Nexus, which is the
 * right behaviour and a worse error message than not asking.
 *
 * ## 🔴 EVERY STRING A SERVER AUTHORED IS UNTRUSTED
 *
 * A tool's name, title, description, schemas and annotations are written by the
 * remote, and so is every string on a call result. Render them as TEXT. The MCP
 * specification calls `annotations` HINTS: `readOnlyHint: true` is a claim, never
 * a permission check, and a server is free to put it on a tool that deletes.
 */
export class McpServersResource extends BaseResource {
  /**
   * Every MCP server this organization has registered.
   *
   * ⚠️ NOT PAGINATED, and the contract declares no cursor — an organization's
   * registered servers are a bounded set an administrator maintains by hand, not a
   * growing table.
   *
   * An EMPTY array is the ordinary answer for an organization that has connected
   * nothing. It is never a refusal and never a scoping failure: the read is
   * anchored on the API key's organization, so there is no cross-tenant reading to
   * mistake it for.
   *
   * @returns Each server's identity, transport, auth mode, last sync outcome and
   * per-status tool counts. Tools themselves are on {@link get}.
   */
  async list(): Promise<ListMcpServersResponse> {
    return this.http.request<ListMcpServersResponse>("GET", `/mcp-servers`);
  }

  /**
   * One server, with every tool row and its standing drift report.
   *
   * ⚠️ `drift` IS A STANDING STATEMENT AND NOT A DELTA OF THE LAST SYNC. A tool
   * that went `CHANGED` two syncs ago is still advertising a contract nobody
   * approved and is still refused at call time, so it is still named here. The
   * lists stop reporting a tool only when an administrator actually answers for
   * it — which is what makes reading this a week after the sync useful rather
   * than misleading.
   *
   * @param serverId - UUID from {@link list}.
   * @returns The server, its tools in every status, and the three drift lists.
   */
  async get(serverId: string): Promise<GetMcpServerResponse> {
    return this.http.request<GetMcpServerResponse>("GET", `/mcp-servers/${serverId}`);
  }

  /**
   * Ask for one server to be dialled again and its tool list reconciled.
   *
   * ## 🔴 IT RETURNS WHEN THE REQUEST IS RECORDED, NOT WHEN THE DISCOVERY IS DONE
   *
   * The route answers 202. The discovery runs out of band — it opens an MCP session,
   * waits for `initialize`, then walks `tools/list`, which against a slow remote is
   * bounded at eleven requests of 150 s. Nothing in this package waits that long and
   * nothing should: a client deadline does not stop a server, so a synchronous door
   * here would convert slow-but-correct discoveries into requests the caller never
   * sees. That is why this method declares no `timeoutMs` — the request it makes is a
   * local enqueue and the 30 s default is generous for it.
   *
   * ## 🚨 `await` RESOLVING IS NOT THE SYNC SUCCEEDING. READ `lastSyncOutcome`
   *
   * | the field reads | what happened |
   * |---|---|
   * | `QUEUED` | the job is on the queue and the discovery has not run |
   * | `FAILED` + `lastSyncErrorCode: "DISCOVERY_NOT_QUEUED"` | the queue REFUSED; nothing is coming |
   * | `SUCCEEDED` | a warm queue finished before this response was composed |
   *
   * Only a refusal to RECORD the request rejects — a bad id, a server in another
   * organization (a 404, on purpose), a key without `mcp_servers:write`. A caller that
   * reports success on the promise resolving reports it over a server that may be
   * unreachable, which is the same mistake as not reading `isError` on
   * {@link callTool}.
   *
   * ## What it can change, which is why it is its own scope
   *
   * A discovery REPLACES the tool list. A tool the remote no longer advertises goes
   * `REMOVED`, which breaks an agent skill pinned to it, and the organization's
   * auto-approval policy runs over what was found — so tools can become callable that
   * were not. `mcp_servers:read` and `mcp_servers:execute` do not satisfy this route;
   * it needs `mcp_servers:write`.
   *
   * @param serverId - UUID from {@link list}.
   * @returns The server as the request left it. `tools` and `drift` are whatever the
   * PREVIOUS discovery produced — poll {@link get} for the new ones.
   */
  async sync(serverId: string): Promise<SyncMcpServerResponse> {
    return this.http.request<SyncMcpServerResponse>("POST", `/mcp-servers/${serverId}/sync`);
  }

  /**
   * Call one APPROVED tool on one of this organization's servers.
   *
   * ## 🔴 THIS DIALS A THIRD PARTY, SPENDING THIS ORGANIZATION'S CREDENTIAL
   *
   * There is no dry run. Whatever the remote tool does, it does — and the only
   * advance warning available is the tool's own `annotations`, which the protocol
   * calls hints and a server can lie in. Read {@link get} first.
   *
   * ## 🔴 `isError: true` RESOLVES, IT DOES NOT THROW
   *
   * A tool reporting its own failure has ANSWERED, and its `text` is what a caller
   * reads to recover — so that arrives as a successful promise carrying
   * `isError: true`. Only a failure to REACH the tool rejects: a refusal before
   * dialling, or the remote breaking the protocol.
   *
   * 🚨 So `await` succeeding is not the tool succeeding. A caller that does not
   * read `isError` treats every tool-reported failure as a result.
   *
   * ## The tool is named in the BODY, and that is a decision rather than a quirk
   *
   * `McpServerTool.name` is server-authored and the MCP specification puts no
   * character constraint on it, so a remote may advertise a name holding `/`, `%`
   * or `..` — unroutable as a path segment at best, traversal-shaped at worst. In
   * a JSON body it is bytes, and it is where the protocol itself puts it. There is
   * no row id on this route at all, so there is no id-to-name hop between the tool
   * an Access Card judged and the string that was dialled.
   *
   * @param serverId - UUID of the server, from {@link list}.
   * @param body - The tool to call and what to send. `expectedSchemaHash` is a
   * REQUIRED key whose value may be `undefined` — see
   * {@link CallMcpServerToolBody.expectedSchemaHash} for why declining to pin has
   * to be written down.
   * @returns The name actually dialled, the tool's own error flag, its text and
   * any image blocks.
   */
  async callTool(
    serverId: string,
    body: CallMcpServerToolBody
  ): Promise<CallMcpServerToolResponse> {
    return this.http.request<CallMcpServerToolResponse>(
      "POST",
      `/mcp-servers/${serverId}/tools/call`,
      { body }
    );
  }
}

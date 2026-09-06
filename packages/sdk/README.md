# @agent-nexus/sdk

Official TypeScript SDK for the [Nexus](https://nexusgpt.io) Public API. Manage agents, tools, folders, and prompt versions programmatically, and stream an agent chat into a browser.

- Zero runtime dependencies (uses native `fetch`)
- Full TypeScript support with detailed types
- Dual CJS/ESM build
- Node.js 18+

## Installation

```bash
npm install @agent-nexus/sdk
# or
pnpm add @agent-nexus/sdk
# or
yarn add @agent-nexus/sdk
```

## Quick Start

```typescript
import { NexusClient } from "@agent-nexus/sdk";

const client = new NexusClient({ apiKey: "nxs_..." });

// List all active agents
const { data: agents, meta } = await client.agents.list({ status: "ACTIVE" });
console.log(`Found ${meta.total} agents`);

// Create a new agent
const agent = await client.agents.create({
  firstName: "Support",
  lastName: "Bot",
  role: "Customer Support Agent"
});
console.log(`Created agent: ${agent.id}`);
```

## Configuration

### Options

```typescript
const client = new NexusClient({
  apiKey: "nxs_...", // Required (or set NEXUS_API_KEY env var)
  baseUrl: "https://api.nexusgpt.io", // Optional, defaults to production
  timeout: 30000, // Optional; see "Timeouts" below before setting it
  defaultHeaders: {}, // Optional, extra headers per request
  fetch: customFetch // Optional, custom fetch implementation
});
```

### Checking responses against the published contract

An installed client can talk to a server that has moved on without it — a field
renamed, a shape changed — and nothing anywhere says so. Install a reporter and
hand it the manifest to check against:

```typescript
import { formatContractReport, NexusClient } from "@agent-nexus/sdk";
import { V1_RESPONSE_CONTRACT } from "@agent-nexus/sdk/v1-response-contract";

const client = new NexusClient({
  apiKey: "nxs_...",
  responseContract: V1_RESPONSE_CONTRACT,
  onResponseContract: (report) => {
    if (report.state === "mismatch") console.warn(formatContractReport(report));
  }
});
```

The check never alters a value: a mismatch is described and the payload handed
back exactly as the server sent it, including fields the manifest does not know
about.

The manifest is its own entry point rather than part of the main one, because it
is the largest thing this package contains and only this feature reads it — a
consumer who does not write that import does not receive those bytes. A reporter
installed without a manifest is told so on every read rather than told nothing.

### Timeouts

Each operation runs under the deadline it needs, so nothing has to be configured
for the common cases:

|                              | Deadline | Applies to                                                                                                                                                                                |
| ---------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_REQUEST_TIMEOUT_MS` | 30 s     | Ordinary reads and writes                                                                                                                                                                 |
| `LONG_RUNNING_TIMEOUT_MS`    | 10 min   | Routes that run a model, or wait on a third party, before they can answer: `skills.executeTask`, `skills.testExternalTool`, `tools.execute`, `workflows.testNode`, `promptAssistant.chat` |

Setting `timeout` on the client **overrides both**, long-running routes included.
That is what a deliberate ceiling needs — and it is why `timeout: 30000` is worth
a second thought: a task whose generation legitimately takes 90 s would abort at
30 s while the server ran it to completion and billed the tokens.

Both constants are exported, so a raised ceiling can start from the right one:

```typescript
import { LONG_RUNNING_TIMEOUT_MS, NexusClient } from "@agent-nexus/sdk";

const client = new NexusClient({ apiKey: "nxs_...", timeout: LONG_RUNNING_TIMEOUT_MS * 2 });
```

A `NexusTimeoutError` means **this client** stopped waiting; the server may still
be completing the request, so never retry a write on one without first checking
whether the first attempt landed.

### Environment Variables

| Variable         | Description                                         |
| ---------------- | --------------------------------------------------- |
| `NEXUS_API_KEY`  | API key (used if `apiKey` option is not provided)   |
| `NEXUS_BASE_URL` | Base URL (used if `baseUrl` option is not provided) |

## API Reference

### Chat (`client.chat`)

Stream an agent turn into a browser, without the browser ever holding your API key.

**The wire format is the Vercel AI SDK 7 UI Message Stream.** Responses announce
`x-vercel-ai-ui-message-stream: v1` and end with `data: [DONE]`, so a stock `useChat()`
renders a Nexus agent with no custom transport and no `prepareSendMessagesRequest`.

#### The two hops

An organization API key can read every conversation in the organization, so it can never
ship to a browser. `createSession` is the only chat call that uses it:

| hop | runs on     | credential                                 | calls           |
| --- | ----------- | ------------------------------------------ | --------------- |
| 1   | your server | org API key, `chat_sessions:execute` scope | `createSession` |
| 2   | the browser | the session token hop 1 minted             | everything else |

The token names one deployment and one conversation and carries no scopes. It expires —
read `expiresInSeconds` rather than hardcoding the number.

```typescript
// ── 1. YOUR SERVER ────────────────────────────────────────────────────────────
import { NexusClient } from "@agent-nexus/sdk";

const server = new NexusClient({ apiKey: "nxs_..." });

const session = await server.chat.createSession(deploymentId, {
  externalUserId: user.id // optional — omit for an anonymous visitor
});
// → { token, sessionId, chatId, expiresInSeconds }
// Send `token` to the browser. Never the API key.
```

```typescript
// ── 2. THE BROWSER ────────────────────────────────────────────────────────────
import { createBrowserChatClient } from "@agent-nexus/sdk";

const chat = createBrowserChatClient({ baseUrl: "https://api.nexusgpt.io" });
const auth = { token }; // the token your server minted

let cursor: string | undefined;
for await (const chunk of chat.stream(
  deploymentId,
  { content: "What are your opening hours?" },
  auth,
  { onEventId: (id) => void (cursor = id) } // keep the resume cursor
)) {
  if (chunk.type === "text-delta") append(chunk.delta);
}
```

`createBrowserChatClient` holds no API key by construction, so `createSession` on it throws
at the call site instead of earning a 401 you have to diagnose. `new NexusClient()` without
a key throws too — it wires forty resources and thirty-eight have no other credential.

#### The `useChat` door

`streamRaw` hands back the `Response` **unread**, headers included, which is what `ai`'s own
transport needs — `stream()` has already thrown the headers away by the time it yields a
frame. Forward it from your own backend and point `useChat` at that route:

```typescript
// app/api/chat/route.ts
export async function POST(req: Request) {
  const upstream = await client.chat.streamRaw(deploymentId, await req.json(), { token });
  return new Response(upstream.body, { headers: upstream.headers });
}

// useChat({ resume: true }) issues a GET at the same path.
export async function GET(req: Request) {
  const lastEventId = req.headers.get("last-event-id");
  const upstream = await client.chat.resumeRaw(
    deploymentId,
    { token },
    { ...(lastEventId !== null && { lastEventId }) }
  );
  return new Response(upstream.body, { headers: upstream.headers });
}
```

🔴 **The caller owns the body.** Nothing in the SDK reads or cancels it — forward it, read
it, or cancel it. Abandoning it pins a connection.
`ChatResource.isUiMessageStream(response)` reports whether the protocol header survived the
hop; its absence is a warning, not a failure.

#### The control surface

A turn is not only started. It is stopped, watched, and picked back up.

| want                                         | call                   |
| -------------------------------------------- | ---------------------- |
| send a message                               | `stream` · `streamRaw` |
| a Stop button                                | `stop`                 |
| "is it still running"                        | `status`               |
| reconnect after a reload or a dropped socket | `resume` · `resumeRaw` |

```typescript
// The Stop button. `accepted` says a live turn was FOUND, never that it has stopped.
const { accepted, turnId } = await chat.stop(deploymentId, {}, auth);

// The fact `stop` deliberately does not claim.
let state = await chat.status(deploymentId, auth);
while (state.running) {
  await new Promise((r) => setTimeout(r, 250));
  state = await chat.status(deploymentId, auth);
}
state.outcome; // "completed" | "failed" | "stopped"

// Reattach exactly where the socket died.
for await (const chunk of chat.resume(deploymentId, auth, {
  lastEventId: cursor,
  onEventId: (id) => void (cursor = id)
})) {
  if (chunk.type === "text-delta") append(chunk.delta);
}
```

#### Four things to get right

**1. Branch on `status().outcome`, never on the frames.** A stopped turn has no single wire
shape — it is the provider's. Measured on two deployments, same build, same prompt, same
stop: one ended `abort {"reason":"user-stop"}` → `finish {"finishReason":"other"}`, the
other ended `data-nexus-error` → `error`, with no `abort` frame at all, because the provider
surfaced the cancellation as a failure. `outcome` read `"stopped"` on both and was the only
reading that did. `finishReason: "other"` is not a synonym either — it is the union's bucket
for anything that ended a turn early.

**2. `stop` reports acceptance, not effect.** The abort reaches the pod running the
generation through a fire-and-forget publish, so nothing the request can compute knows
whether it landed. Measured: `accepted: true` returned while `status` still read
`running: true` at `frameCount: 17`, settling about 1.8 s later at
`outcome: "stopped", frameCount: 21` — four frames written after the acceptance. Poll
`status`.

**3. The resume cursor is exclusive, and a resumed stream opens with a frame that is not a
log entry.** `lastEventId: "<turn>:13"` replays from `:14`, so the two halves of the answer
join with no overlap and no gap; omit it and the whole turn replays, which is what a page
that reloaded and holds nothing wants. Because a cursor lands mid-block, the server
synthesises an opener for **every block still open** — one per open block, not one
`text-start` — carrying the original block id and no `id:` line of its own, so it must not
move your cursor. A client that special-cases "the first frame" throws on the second.
`onEventId` is deliberately not called for them.

`ChatTurnStatus.lastEventId` is the newest frame **recorded**, not the newest you received,
so it is the wrong value to reattach with after a drop. Use the cursor you kept.

**4. One credential, never two.** A request carrying both an API key and a session token
authenticates as the API key and is then refused `401 "Chat session is not valid."` — a
message that reads like an expired token and sends you hunting the wrong thing. The SDK
presents exactly one, session token first; a hand-rolled `fetch` has to.

Two more worth knowing:

- **A mint with no `chatId` writes no row.** The conversation id is reserved and created by
  the first message, so minting is safe to call speculatively — but minting _again_ with
  that reserved id answers `404 Chat not found`. Keep the token from the first mint.
- **Any 401 from a chat route means the session is finished.** Expired, revoked, wrong
  deployment and forged all answer identically, on purpose. Ask your server for a fresh
  token; never retry the same one.

### Agents

```typescript
// List agents (paginated)
const { data, meta } = await client.agents.list({
  page: 1,
  limit: 20,
  status: "ACTIVE",
  search: "support"
});

// Get agent details
const agent = await client.agents.get("agent-id");

// Create agent
const created = await client.agents.create({ firstName: "A", lastName: "B", role: "Assistant" });

// Update agent
const updated = await client.agents.update("agent-id", { role: "Senior Assistant" });

// Delete agent
await client.agents.delete("agent-id");

// Duplicate agent
const copy = await client.agents.duplicate("agent-id");

// Upload profile picture
await client.agents.uploadProfilePicture("agent-id", file);
```

### Agent Tools

```typescript
// List tools for an agent
const tools = await client.agents.tools.list("agent-id");

// Get tool details
const tool = await client.agents.tools.get("agent-id", "tool-id");

// Create tool
const created = await client.agents.tools.create("agent-id", {
  label: "Web Search",
  type: "PLUGIN"
});

// Update tool
await client.agents.tools.update("agent-id", "tool-id", { label: "Updated Label" });

// Delete tool
await client.agents.tools.delete("agent-id", "tool-id");
```

### Folders

```typescript
// List folders and assignments
const { folders, assignments } = await client.folders.list();

// Create folder
const folder = await client.folders.create({ name: "Support Agents" });

// Update folder
await client.folders.update("folder-id", { name: "Renamed" });

// Delete folder
await client.folders.delete("folder-id");

// Assign agent to folder (or set folderId to null to remove)
await client.folders.assignAgent({ agentId: "agent-id", folderId: "folder-id" });
```

### Tool Discovery (`client.tools`)

The tool discovery resource enables the full LLM tool-configuration workflow: search for tools, inspect their parameters, resolve dynamic dropdown values, and test execution.

**Recommended workflow:** search → get detail → list credentials → resolve dynamic fields → configure on agent → test.

```typescript
// 1. Search marketplace tools
const results = await client.tools.search({ q: "gmail", limit: 5 });
// results.tools — matching tools
// results.facets — category facet counts
// results.total — total matches

// 2. Get full tool detail (actions + parameter schemas)
const detail = await client.tools.get("tool-id");
// detail.actions — array of actions (e.g. "Send Email", "Create Draft")
// Each action has parameters with types, descriptions, and remoteOptions flags

// 3. List credentials (connected accounts) for the tool
const { credentials } = await client.tools.credentials("tool-id");
// credentials[0].id — use this as credentialId below

// 4. Resolve dynamic dropdown options
// For parameters where remoteOptions === true, fetch options at runtime:
const { options } = await client.tools.resolveOptions("tool-id", {
  componentId: "gmail-send-email", // from action.key
  propName: "label", // from parameter.name
  credentialId: "cred-id", // from credentials list
  configuredProps: {} // previously selected values (for cascading fields)
});
// options — [{ label: "Inbox", value: "INBOX" }, ...]

// 5. Configure the tool on an agent (existing endpoint)
await client.agents.tools.create("agent-id", {
  label: "Gmail - Send Email",
  type: "PLUGIN",
  config: { toolId: "tool-id" /* action, parameters, credential */ }
});

// 6. Test the configured tool
const result = await client.tools.test("agent-id", "tool-config-id", {
  input: { to: "test@example.com", subject: "Hello" }
});
// result.status — "success" | "error"
// result.output — tool's return value
// result.executionTimeMs — timing
```

```typescript
// List org skills (workflows, AI tasks, collections)
const { skills, total } = await client.tools.skills({ type: "WORKFLOW", limit: 10 });

// Search skills by name
const filtered = await client.tools.skills({ search: "onboarding" });
```

### Prompt Versions

```typescript
// List versions (paginated)
const { data: versions, meta } = await client.agents.versions.list("agent-id");

// Get version details
const version = await client.agents.versions.get("agent-id", "version-id");

// Create checkpoint
const checkpoint = await client.agents.versions.createCheckpoint("agent-id", { name: "v1.0" });

// Update version metadata
await client.agents.versions.update("agent-id", "version-id", { name: "v1.1" });

// Delete version
await client.agents.versions.delete("agent-id", "version-id");

// Restore agent prompt to a specific version
const result = await client.agents.versions.restore("agent-id", "version-id");

// Publish version to production
await client.agents.versions.publish("agent-id", "version-id");
```

## Error Handling

```typescript
import {
  NexusApiError,
  NexusAuthenticationError,
  NexusConnectionError,
  NexusTimeoutError
} from "@agent-nexus/sdk";

try {
  await client.agents.get("non-existent-id");
} catch (err) {
  if (err instanceof NexusAuthenticationError) {
    console.error("Invalid API key");
  } else if (err instanceof NexusApiError) {
    console.error(`API error [${err.code}]: ${err.message} (status ${err.status})`);
  } else if (err instanceof NexusTimeoutError) {
    // Client-side timeout — the server may still be processing the request.
    // `err.timeoutMs` is the deadline that actually elapsed, which is the
    // operation's own when you did not set `timeout` on the client.
    console.error(`Timed out after ${err.timeoutMs}ms`);
  } else if (err instanceof NexusConnectionError) {
    console.error("Network error:", err.message);
  }
}
```

## TypeScript

All types are exported for use in your application:

```typescript
import type {
  AgentDetail,
  AgentSummary,
  CreateAgentBody,
  AgentToolConfig,
  AgentFolder,
  VersionDetail,
  PageResponse,
  // Tool discovery types
  MarketplaceToolItem,
  MarketplaceToolDetail,
  ToolAction,
  ToolActionParameter,
  ToolCredential,
  RemoteOption,
  SkillItem,
  TestAgentToolResponse,
  // Chat types
  ChatSession,
  ChatStreamAuth,
  ChatStreamChunk,
  ChatStreamFinishReason,
  ChatStopResult,
  ChatTurnOutcome,
  ChatTurnStatus,
  ChatResumeCursor,
  ChatResumeOptions,
  ChatStreamOptions,
  CreateChatSessionBody,
  SendChatMessageBody,
  StopChatTurnBody,
  BrowserChatClientOptions
} from "@agent-nexus/sdk";
```

## License

MIT

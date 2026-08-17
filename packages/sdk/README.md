# @agent-nexus/sdk

Official TypeScript SDK for the [Nexus](https://nexusgpt.io) Public API. Manage agents, tools, folders, and prompt versions programmatically.

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
  TestAgentToolResponse
} from "@agent-nexus/sdk";
```

## License

MIT

// AUTO-GENERATED — do not edit. Run: pnpm run gen:docs

export interface DocTopic {
  title: string;
  description: string;
  content: string;
}

export const DOCS: Record<string, DocTopic> = {
  overview: {
    title: "CLI Overview",
    description: "Installation, authentication, profiles, global options, quick start",
    content: `# @agent-nexus/cli

Official CLI for the [Nexus](https://nexusgpt.io) AI agent platform. Manage agents, workflows, deployments, knowledge bases, and more from your terminal.

- Wraps the full [Nexus Public API v1](../sdk)
- 24 command groups, 120+ subcommands
- Table, record, and JSON output modes
- Pipe-friendly: stdin input, \`--json\` output, composable with \`jq\`
- Zero config after \`nexus auth login\`
- Node.js 18+

> **Status: BETA** -- The CLI surface is stable but may evolve before 1.0.

---

## Table of Contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Quick Start](#quick-start)
- [Global Options](#global-options)
- [Input Patterns](#input-patterns)
- [Output Modes](#output-modes)
- [Commands](#commands)
- [Common Patterns](#common-patterns)
- [SDK Cross-Reference](#sdk-cross-reference)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Configuration Files](#configuration-files)
- [Related Resources](#related-resources)
- [License](#license)

---

## Installation

\`\`\`bash
# Install globally
npm install -g @agent-nexus/cli

# Or with pnpm
pnpm add -g @agent-nexus/cli

# Or with yarn
yarn global add @agent-nexus/cli
\`\`\`

Run a one-off command without installing:

\`\`\`bash
npx @agent-nexus/cli agent list
\`\`\`

Verify the installation:

\`\`\`bash
nexus --version
\`\`\`

Upgrade to the latest version:

\`\`\`bash
nexus upgrade
\`\`\`

> The CLI checks for updates once per day and prints a notice to stderr when a newer version is available. This check never delays command execution.

---

## Authentication

### Interactive Login

\`\`\`bash
nexus auth login
\`\`\`

This opens the Nexus settings page in your browser. Copy your API key and paste it at the prompt. The key is validated against the API before being saved.

### Non-Interactive Login

For CI/CD or scripting:

\`\`\`bash
# Via flag
nexus auth login --api-key nxs_abc123

# Via environment variable (no login needed)
export NEXUS_API_KEY=nxs_abc123
\`\`\`

### Verify Authentication

\`\`\`bash
nexus auth whoami
\`\`\`

Prints the API base URL and a masked version of your key (e.g., \`nxs_abc1...3def\`).

### Logout

\`\`\`bash
nexus auth logout
\`\`\`

Removes stored credentials from \`~/.nexus-mcp/config.json\`.

### API Key Resolution

The CLI resolves the API key in this order (first match wins):

| Priority | Source                  | Example                              |
| -------- | ----------------------- | ------------------------------------ |
| 1        | \`--api-key\` flag        | \`nexus agent list --api-key nxs_...\` |
| 2        | \`NEXUS_API_KEY\` env var | \`export NEXUS_API_KEY=nxs_...\`       |
| 3        | Config file             | Written by \`nexus auth login\`        |

### Base URL Resolution

| Priority | Source                   | Default                                                                   |
| -------- | ------------------------ | ------------------------------------------------------------------------- |
| 1        | \`--base-url\` flag        |                                                                           |
| 2        | \`NEXUS_BASE_URL\` env var |                                                                           |
| 3        | Config file              |                                                                           |
| 4        | \`NEXUS_ENV\` env var      | \`production\` = \`https://api.nexusgpt.io\`, \`dev\` = \`http://localhost:3001\` |
| 5        | Default                  | \`https://api.nexusgpt.io\`                                                 |

### Multi-Profile Support

The CLI supports multiple named profiles for managing different organizations or environments.

#### Create profiles

\`\`\`bash
# Interactive (opens browser, prompts for key and profile name)
nexus auth login

# Non-interactive with explicit profile name
nexus auth login --profile work --api-key nxs_abc123
nexus auth login --profile personal --api-key nxs_xyz789
\`\`\`

#### Switch between profiles

\`\`\`bash
nexus auth switch work
nexus auth switch personal
\`\`\`

#### List all profiles

\`\`\`bash
nexus auth list
#  PROFILE    ORGANIZATION   BASE URL
# ▸ work      Acme Corp      https://api.nexusgpt.io
#   personal  My Startup     https://api.nexusgpt.io
\`\`\`

#### Pin a directory to a profile

Create a \`.nexusrc\` file in your project directory so the CLI automatically uses the right profile:

\`\`\`bash
cd ~/projects/acme
nexus auth pin work
# Creates .nexusrc with { "profile": "work" }

cd ~/projects/startup
nexus auth pin personal
\`\`\`

#### Check which profile is active

\`\`\`bash
nexus auth status
# Using profile "work" (Acme Corp) — .nexusrc at /Users/you/projects/acme/.nexusrc
\`\`\`

#### Profile Resolution Order

When determining which profile to use, the CLI checks (first match wins):

| Priority | Source                                  | Example                                    |
| -------- | --------------------------------------- | ------------------------------------------ |
| 1        | \`--api-key\` flag or \`NEXUS_API_KEY\` env | Bypasses profiles entirely                 |
| 2        | \`--profile\` flag                        | \`nexus agent list --profile work\`          |
| 3        | \`NEXUS_PROFILE\` env var                 | \`export NEXUS_PROFILE=work\`                |
| 4        | \`.nexusrc\` file                         | Walks up directory tree to find \`.nexusrc\` |
| 5        | Active profile                          | Set by \`nexus auth switch\`                 |
| 6        | \`"default"\` profile                     | Fallback                                   |

#### Remove profiles

\`\`\`bash
nexus auth logout           # removes active profile
nexus auth logout work      # removes specific profile
nexus auth logout --all     # removes everything

nexus auth unpin            # removes .nexusrc from current directory
\`\`\`

---

## Quick Start

A complete walkthrough: create an agent, give it a knowledge base, deploy it, and test it.

\`\`\`bash
# 1. Authenticate
nexus auth login

# 2. Create an agent
nexus agent create \\
  --first-name "Support" \\
  --last-name "Bot" \\
  --role "Customer Support" \\
  --prompt "You are a helpful customer support agent. Answer questions using the knowledge base."

# 3. Upload a document to the knowledge base
nexus document upload ./product-faq.pdf

# 4. Create a collection (retrieval-augmented generation index)
nexus collection create --name "Product FAQ"

# 5. Attach the document to the collection
nexus collection attach-documents <collection-id> --document-ids <document-id>

# 6. Attach the collection as a tool on the agent
nexus agent-tool create <agent-id> \\
  --type COLLECTION \\
  --collection-id <collection-id> \\
  --label "FAQ Search"

# 7. Deploy the agent as a web widget
nexus deployment create \\
  --name "Support Widget" \\
  --type web \\
  --agent-id <agent-id>

# 8. Test via the emulator
nexus emulator session create <deployment-id>
nexus emulator send <deployment-id> <session-id> \\
  --text "How do I reset my password?"
\`\`\`

> **Tip:** Add \`--json\` to any command and pipe to \`jq\` to extract IDs:
>
> \`\`\`bash
> AGENT_ID=$(nexus agent create --first-name Bot --last-name Helper --role QA --json | jq -r '.id')
> \`\`\`

---

## Global Options

These flags are available on every command:

| Flag               | Description                                       |
| ------------------ | ------------------------------------------------- |
| \`--json\`           | Output results as JSON (for scripting and piping) |
| \`--api-key <key>\`  | Override the API key for this invocation          |
| \`--base-url <url>\` | Override the API base URL                         |
| \`--profile <name>\` | Use a specific named profile                      |
| \`--no-auto-update\` | Disable automatic CLI updates for this invocation |
| \`-v, --version\`    | Print the CLI version and exit                    |
| \`--help\`           | Show help for any command or subcommand           |

### Environment Variables

| Variable         | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| \`NEXUS_API_KEY\`  | API key (used when \`--api-key\` flag and config file are absent) |
| \`NEXUS_BASE_URL\` | API base URL override                                           |
| \`NEXUS_ENV\`      | Environment name: \`production\` (default) or \`dev\`               |
| \`NEXUS_PROFILE\`  | Profile name override (same as \`--profile\` flag)                |
| \`NO_COLOR\`       | Disable all color output ([no-color.org](https://no-color.org)) |

---

## Input Patterns

The CLI offers flexible input for create and update commands.

### The \`--body\` Flag

Most create/update commands accept \`--body\` for raw JSON input:

\`\`\`bash
# Inline JSON
nexus agent create --body '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}'

# From a JSON file
nexus agent create --body payload.json

# From stdin
cat payload.json | nexus agent create --body -
echo '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}' | nexus agent create --body -
\`\`\`

### Flag-Over-Body Merge

When you use both \`--body\` and individual flags, **flags take precedence**. The body provides defaults; flags override specific fields:

\`\`\`bash
# Body sets firstName and role; --role flag overrides the role field
nexus agent create \\
  --body '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}' \\
  --role "Senior Assistant"
# Result: { firstName: "Ada", lastName: "Bot", role: "Senior Assistant" }
\`\`\`

### File and Stdin Input

Flags like \`--prompt\`, \`--content\`, and \`--description\` accept:

| Input        | Example                                                          |
| ------------ | ---------------------------------------------------------------- |
| Literal text | \`--prompt "You are a helpful agent"\`                             |
| File path    | \`--prompt ./system-prompt.md\` (auto-detected if the file exists) |
| Stdin        | \`--prompt -\` (reads from stdin)                                  |

\`\`\`bash
# Load a prompt from a markdown file
nexus agent create --first-name Bot --last-name Helper --role QA --prompt ./prompt.md

# Pipe a prompt from another command
generate-prompt | nexus agent update abc-123 --prompt -
\`\`\`

### Pagination

List commands support pagination:

\`\`\`bash
nexus agent list --page 2 --limit 50
\`\`\`

The pagination footer shows \`total\`, \`page\`, and whether \`more available\`.

---

## Output Modes

### Table (Default for Lists)

\`\`\`
ID                                    FIRST NAME       STATUS
────────────────────────────────────  ───────────────  ──────
abc-123-def-456                       Support Bot      ACTIVE
ghi-789-jkl-012                       Sales Agent      DRAFT

3 total · page 1 · more available
\`\`\`

### Record (Default for Single Resources)

\`\`\`
ID        abc-123-def-456
Name      Support Bot
Role      Customer Support
Status    ACTIVE
Created   2026-03-15T10:30:00.000Z
\`\`\`

### JSON (\`--json\`)

\`\`\`bash
nexus agent list --json
\`\`\`

\`\`\`json
{
  "data": [{ "id": "abc-123", "firstName": "Support", "lastName": "Bot", "status": "ACTIVE" }],
  "meta": { "total": 3, "page": 1, "hasMore": true }
}
\`\`\`

\`\`\`bash
nexus agent get abc-123 --json
\`\`\`

\`\`\`json
{
  "id": "abc-123",
  "firstName": "Support",
  "lastName": "Bot",
  "role": "Customer Support",
  "status": "ACTIVE"
}
\`\`\`

> **Important:** Always use \`--json\` when piping output to \`jq\` or other tools. The default table output is for humans and will break parsers.

### Error Output in JSON Mode

When \`--json\` is active, errors are also returned as JSON:

\`\`\`json
{
  "error": {
    "message": "Authentication failed — invalid or missing API key.",
    "hint": "Run \\"nexus auth login\\" to re-authenticate, or set NEXUS_API_KEY."
  }
}
\`\`\`

---

## Commands

All commands follow the pattern: \`nexus <group> <action> [arguments] [options]\`

### Core Platform

| Command                                                    | Subcommands                                                      | Description               |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| [\`auth\`](docs/command-reference.md#nexus-auth)             | \`login\` \`logout\` \`switch\` \`list\` \`pin\` \`unpin\` \`status\` \`whoami\` | Authentication            |
| [\`agent\`](docs/command-reference.md#nexus-agent)           | \`list\` \`get\` \`create\` \`update\` \`delete\` \`duplicate\`              | AI agent management       |
| [\`agent-tool\`](docs/command-reference.md#nexus-agent-tool) | \`list\` \`get\` \`create\` \`update\` \`delete\`                          | Agent tool configurations |
| [\`version\`](docs/command-reference.md#nexus-version)       | \`list\` \`get\` \`create\` \`update\` \`delete\` \`restore\` \`publish\`      | Prompt version management |
| [\`folder\`](docs/command-reference.md#nexus-folder)         | \`list\` \`create\` \`update\` \`delete\` \`assign\`                       | Agent folder organization |
| [\`model\`](docs/command-reference.md#nexus-model)           | \`list\`                                                           | Available AI models       |

### Workflows & Execution

| Command                                                              | Subcommands                                                                                 | Description                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| [\`workflow\`](docs/command-reference.md#nexus-workflow)               | \`list\` \`get\` \`create\` \`update\` \`delete\` \`duplicate\` \`publish\` \`unpublish\` \`validate\` \`test\` | Workflow CRUD and lifecycle |
| [\`workflow node\`](docs/command-reference.md#nexus-workflow-node)     | \`create\` \`get\` \`update\` \`delete\` \`test\` \`variables\` \`output-format\` \`reload-props\`          | Workflow node operations    |
| [\`workflow edge\`](docs/command-reference.md#nexus-workflow-edge)     | \`create\` \`delete\`                                                                           | Node connections            |
| [\`workflow branch\`](docs/command-reference.md#nexus-workflow-branch) | \`list\` \`create\` \`update\` \`delete\`                                                           | Branching logic             |
| [\`execution\`](docs/command-reference.md#nexus-execution)             | \`list\` \`get\` \`graph\` \`output\` \`retry\` \`export\` \`node-result\`                                | Workflow execution history  |

### Knowledge & Documents

| Command                                                    | Subcommands                                                                                               | Description           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| [\`document\`](docs/command-reference.md#nexus-document)     | \`list\` \`get\` \`upload\` \`create-text\` \`add-website\` \`import-google-sheets\` \`delete\`                         | Knowledge documents   |
| [\`collection\`](docs/command-reference.md#nexus-collection) | \`list\` \`get\` \`create\` \`update\` \`delete\` \`search\` \`documents\` \`attach-documents\` \`remove-document\` \`stats\` | Knowledge collections |

### Skills & Tasks

| Command                                                          | Subcommands                                       | Description            |
| ---------------------------------------------------------------- | ------------------------------------------------- | ---------------------- |
| [\`task\`](docs/command-reference.md#nexus-task)                   | \`list\` \`get\` \`create\` \`update\` \`delete\` \`execute\` | AI task management     |
| [\`template\`](docs/command-reference.md#nexus-template)           | \`list\` \`get\` \`create\` \`upload\` \`generate\`         | Document templates     |
| [\`external-tool\`](docs/command-reference.md#nexus-external-tool) | \`list\` \`get\` \`create\` \`update\` \`delete\` \`test\`    | OpenAPI external tools |

### Deployment & Testing

| Command                                                                  | Subcommands                                                                                      | Description                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| [\`deployment\`](docs/command-reference.md#nexus-deployment)               | \`list\` \`get\` \`create\` \`update\` \`delete\` \`duplicate\` \`stats\` \`embed-config\` \`embed-config-update\` | Agent deployments                 |
| [\`deployment folder\`](docs/command-reference.md#nexus-deployment-folder) | \`list\` \`create\` \`update\` \`delete\` \`assign\`                                                       | Deployment folder organization    |
| [\`emulator\`](docs/command-reference.md#nexus-emulator)                   | \`send\`                                                                                           | Send messages to test deployments |
| [\`emulator session\`](docs/command-reference.md#nexus-emulator-session)   | \`create\` \`list\` \`get\` \`delete\`                                                                   | Emulator session management       |
| [\`emulator scenario\`](docs/command-reference.md#nexus-emulator-scenario) | \`save\` \`list\` \`get\` \`replay\` \`delete\`                                                            | Save and replay test scenarios    |

### Marketplace & Discovery

| Command                                        | Subcommands                                                              | Description                |
| ---------------------------------------------- | ------------------------------------------------------------------------ | -------------------------- |
| [\`tool\`](docs/command-reference.md#nexus-tool) | \`search\` \`get\` \`credentials\` \`connect\` \`resolve-options\` \`skills\` \`test\` | Marketplace tool discovery |

### Analytics & Operations

| Command                                                                | Subcommands                                                                           | Description                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| [\`analytics\`](docs/command-reference.md#nexus-analytics)               | \`overview\` \`feedback\` \`export\`                                                        | Organization analytics     |
| [\`eval\`](docs/command-reference.md#nexus-eval)                         | (subgroups: \`session\`, \`dataset\`, \`execute\`, \`judge\`, \`results\`, \`formats\`, \`judges\`) | AI task evaluation         |
| [\`ticket\`](docs/command-reference.md#nexus-ticket)                     | \`list\` \`get\` \`create\` \`update\` \`comment\` \`comments\`                                   | Bug and feature tracking   |
| [\`phone-number\`](docs/command-reference.md#nexus-phone-number)         | \`search\` \`buy\` \`list\` \`get\` \`release\`                                                 | Phone number management    |
| [\`channel\`](docs/command-reference.md#nexus-channel)                   | \`setup\` \`connection list\\|create\` \`whatsapp-sender list\\|create\\|get\`                 | Channel setup orchestrator |
| [\`prompt-assistant\`](docs/command-reference.md#nexus-prompt-assistant) | \`chat\` \`get-thread\` \`delete-thread\`                                                   | AI-assisted prompt writing |

### Utility

| Command                                              | Subcommands     | Description                    |
| ---------------------------------------------------- | --------------- | ------------------------------ |
| [\`api\`](docs/command-reference.md#nexus-api)         | (passthrough)   | Call any API endpoint directly |
| [\`docs\`](docs/command-reference.md#nexus-docs)       | (topic browser) | View built-in documentation    |
| [\`upgrade\`](docs/command-reference.md#nexus-upgrade) | (self-update)   | Upgrade the CLI to latest      |

> **Full reference:** See [docs/command-reference.md](docs/command-reference.md) for complete documentation of every command, option, and example.

---

## Common Patterns

### Extract IDs with \`jq\`

\`\`\`bash
# Get the ID of a newly created agent
AGENT_ID=$(nexus agent create \\
  --first-name Bot --last-name Helper --role QA --json | jq -r '.id')
echo "Created agent: $AGENT_ID"
\`\`\`

### Pipe JSON Output

\`\`\`bash
# List all active agent IDs
nexus agent list --json | jq -r '.data[] | select(.status == "ACTIVE") | .id'

# Count deployments by type
nexus deployment list --json | jq '.data | group_by(.type) | map({type: .[0].type, count: length})'
\`\`\`

### Bulk Operations

\`\`\`bash
# Update all agents to use a specific model
nexus agent list --json | jq -r '.data[].id' | while read id; do
  nexus agent update "$id" --model gpt-4o
  echo "Updated $id"
done
\`\`\`

### Raw API Passthrough

For endpoints without a dedicated CLI command:

\`\`\`bash
# GET request
nexus api GET /models

# POST with inline body
nexus api POST /agents --body '{"firstName":"Test","lastName":"Bot","role":"QA"}'

# GET with query parameters
nexus api GET /agents --query page=1 --query limit=5

# POST with body from file
nexus api PATCH /agents/abc-123 --body payload.json

# POST with body from stdin
echo '{"text":"hello"}' | nexus api POST /emulator/dep-1/sessions/s-1/messages --body -
\`\`\`

### Suppress Confirmation Prompts (CI/CD)

\`\`\`bash
# Skip delete confirmation
nexus agent delete abc-123 --yes

# Preview what would be deleted without executing
nexus agent delete abc-123 --dry-run
\`\`\`

### Load Prompts from Files

\`\`\`bash
# Create an agent with a prompt from a markdown file
nexus agent create \\
  --first-name Support --last-name Bot --role "Customer Support" \\
  --prompt ./prompts/support-agent.md

# Update an agent's prompt from stdin
cat new-prompt.md | nexus agent update abc-123 --prompt -
\`\`\`

### Workflow Build Pipeline

\`\`\`bash
# Create, build, validate, test, and publish in one pipeline
WF_ID=$(nexus workflow create --name "Lead Qualifier" --json | jq -r '.id')

nexus workflow node create $WF_ID --type agentInputTrigger --name "Start"
nexus workflow node create $WF_ID --type aiTask --name "Qualify" \\
  --body '{"data":{"taskId":"task-123"}}'

nexus workflow validate $WF_ID
nexus workflow test $WF_ID --input '{"message":"I want to buy 100 units"}'
nexus workflow publish $WF_ID
\`\`\`

---

## SDK Cross-Reference

Every CLI command maps to an SDK method. Use the SDK (\`@agent-nexus/sdk\`) when building applications; use the CLI for scripting and exploration.

| CLI Command                             | SDK Equivalent                                        |
| --------------------------------------- | ----------------------------------------------------- |
| \`nexus agent list\`                      | \`client.agents.list()\`                                |
| \`nexus agent get <id>\`                  | \`client.agents.get(id)\`                               |
| \`nexus agent create --first-name X ...\` | \`client.agents.create({ firstName: "X", ... })\`       |
| \`nexus agent update <id> --role Y\`      | \`client.agents.update(id, { role: "Y" })\`             |
| \`nexus agent delete <id>\`               | \`client.agents.delete(id)\`                            |
| \`nexus agent-tool list <agentId>\`       | \`client.agents.tools.list(agentId)\`                   |
| \`nexus version list <agentId>\`          | \`client.agents.versions.list(agentId)\`                |
| \`nexus workflow list\`                   | \`client.workflows.list()\`                             |
| \`nexus workflow publish <id>\`           | \`client.workflows.publish(id)\`                        |
| \`nexus document upload <file>\`          | \`client.documents.uploadFile(file)\`                   |
| \`nexus collection create --name X\`      | \`client.documents.createCollection({ name: "X" })\`    |
| \`nexus deployment create --name X ...\`  | \`client.deployments.create({ name: "X", ... })\`       |
| \`nexus emulator session create <depId>\` | \`client.emulator.createSession(depId)\`                |
| \`nexus emulator send <depId> <sessId>\`  | \`client.emulator.sendMessage(depId, sessId, { ... })\` |
| \`nexus tool search --query X\`           | \`client.tools.search({ query: "X" })\`                 |
| \`nexus analytics overview\`              | \`client.analytics.getOverview()\`                      |
| \`nexus model list\`                      | \`client.models.list()\`                                |
| \`nexus ticket create --title X ...\`     | \`client.tickets.create({ title: "X", ... })\`          |
| \`nexus phone-number list\`               | \`client.phoneNumbers.list()\`                          |
| \`nexus channel setup --type WHATSAPP\`   | \`client.channels.getSetupStatus("WHATSAPP")\`          |
| \`nexus channel connection create\`       | \`client.channels.createConnection()\`                  |
| \`nexus channel whatsapp-sender create\`  | \`client.channels.createWhatsAppSender({ ... })\`       |

> **Full SDK documentation:** See [@agent-nexus/sdk README](../sdk/README.md)

---

## Error Handling

The CLI catches all errors and prints actionable messages with hints.

### Error Types

| Error                      | Cause                                | Hint                                                   |
| -------------------------- | ------------------------------------ | ------------------------------------------------------ |
| **Authentication failed**  | Invalid, missing, or expired API key | Run \`nexus auth login\` or set \`NEXUS_API_KEY\`          |
| **Not found (404)**        | Resource ID doesn't exist            | Run \`nexus <resource> list\` to find valid IDs          |
| **Validation error (422)** | Invalid request body or parameters   | Add \`--json\` to see the \`details\` field                |
| **Connection error**       | Network issue or wrong base URL      | Check \`--base-url\` and network connectivity            |
| **API error (5xx)**        | Server-side error                    | Retry after a moment; report via \`nexus ticket create\` |

### Exit Codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| \`0\`  | Success                                                       |
| \`1\`  | Any error (authentication, API, validation, connection, etc.) |

### Error Format

**Human-readable (default):**

\`\`\`
Error: Authentication failed — invalid or missing API key.
  Run "nexus auth login" to re-authenticate, or set NEXUS_API_KEY.
\`\`\`

**JSON (\`--json\`):**

\`\`\`json
{
  "error": {
    "message": "Authentication failed — invalid or missing API key.",
    "hint": "Run \\"nexus auth login\\" to re-authenticate, or set NEXUS_API_KEY."
  }
}
\`\`\`

---

## Troubleshooting

### "No API key found"

\`\`\`
Error: No API key found. Set NEXUS_API_KEY or run:
  nexus auth login
\`\`\`

**Fix:** Run \`nexus auth login\` or set the \`NEXUS_API_KEY\` environment variable.

### "Invalid key format -- keys start with nxs\\_"

**Fix:** Copy the full API key from Settings > API Keys, including the \`nxs_\` prefix.

### "Could not reach the Nexus API"

**Fix:** Check your network connection. If using a custom base URL, verify it:

\`\`\`bash
nexus auth whoami  # shows the current base URL
\`\`\`

### "Validation failed (HTTP 401)"

**Fix:** Your API key may be expired or revoked. Regenerate it at [Settings > API Keys](https://app.nexusgpt.io/app/settings/api-keys) and run \`nexus auth login\` again.

### Colors Not Showing

The CLI disables colors when:

- \`NO_COLOR\` environment variable is set
- \`--no-color\` flag is passed
- stdout is not a TTY (e.g., piped to a file or another command)

### Update Check Not Working

The version check cache is stored at \`~/.nexus-mcp/version-check.json\`. Delete it to force a fresh check:

\`\`\`bash
rm ~/.nexus-mcp/version-check.json
nexus agent list  # triggers a new check
\`\`\`

### Upgrade Failed

If \`nexus upgrade\` fails (e.g., permission denied), run the install manually:

\`\`\`bash
sudo npm install -g @agent-nexus/cli@latest
\`\`\`

---

## Configuration Files

| File                              | Purpose                                                       | Permissions |
| --------------------------------- | ------------------------------------------------------------- | ----------- |
| \`~/.nexus-mcp/config.json\`        | Profiles with API keys and base URLs                          | \`0600\`      |
| \`~/.nexus-mcp/version-check.json\` | Update check cache (auto-managed, checked once/day)           | \`0600\`      |
| \`.nexusrc\`                        | Directory-level profile pinning (created by \`nexus auth pin\`) | —           |

The \`~/.nexus-mcp/\` directory is created with \`0700\` permissions. This path is shared with the [\`@nexus/mcp-server\`](../mcp-server/) package.

### Config File Format (V2)

\`\`\`json
{
  "activeProfile": "work",
  "profiles": {
    "work": {
      "apiKey": "nxs_...",
      "baseUrl": "https://api.nexusgpt.io",
      "orgName": "Acme Corp",
      "orgId": "org_..."
    },
    "personal": {
      "apiKey": "nxs_...",
      "orgName": "My Startup"
    }
  }
}
\`\`\`

### .nexusrc Format

\`\`\`json
{ "profile": "work" }
\`\`\`

Place in your project root. The CLI walks up the directory tree to find it. Consider adding \`.nexusrc\` to \`.gitignore\`.

---

## Related Resources

| Resource              | Link                                                                           |
| --------------------- | ------------------------------------------------------------------------------ |
| SDK                   | [\`@agent-nexus/sdk\`](../sdk/README.md)                                         |
| Product Documentation | [\`packages/docs\`](../docs/)                                                    |
| Claude Code Skills    | [\`packages/claude-code-skills\`](../claude-code-skills/)                        |
| API Reference         | \`https://api.nexusgpt.io/api/public/v1\`                                        |
| Dashboard             | [app.nexusgpt.io](https://app.nexusgpt.io)                                     |
| CLI Command Reference | [docs/command-reference.md](docs/command-reference.md)                         |
| Input/Output Guide    | [docs/input-output-patterns.md](docs/input-output-patterns.md)                 |
| Common Gotchas        | [docs/gotchas.md](docs/gotchas.md)                                             |
| Recipes               | [docs/recipes.md](docs/recipes.md)                                             |
| Report Issues         | \`nexus ticket create --type BUG --title "..." --description "..."\`             |
| Request Features      | \`nexus ticket create --type FEATURE_REQUEST --title "..." --description "..."\` |

---

## License

[MIT](LICENSE)`
  },
  commands: {
    title: "Command Reference",
    description: "Full reference for all 24 command groups with options and examples",
    content: `# Command Reference

Complete reference for all \`@agent-nexus/cli\` commands. For installation and configuration, see the [README](../README.md).

---

## Global Options

These options are available on every command:

| Option             | Description                                       |
| ------------------ | ------------------------------------------------- |
| \`--json\`           | Output raw JSON instead of formatted tables       |
| \`--api-key <key>\`  | Override API key for this invocation              |
| \`--base-url <url>\` | Override the API base URL                         |
| \`--profile <name>\` | Use a specific named profile                      |
| \`--no-auto-update\` | Disable automatic CLI updates for this invocation |
| \`-v, --version\`    | Print CLI version                                 |
| \`--help\`           | Show help for any command                         |

---

## nexus auth

Manage authentication and profiles.

### auth login

Authenticate with the Nexus API and create a profile.

\`\`\`
nexus auth login [options]
\`\`\`

| Option             | Description                                                |
| ------------------ | ---------------------------------------------------------- |
| \`--api-key <key>\`  | API key (skip interactive prompt)                          |
| \`--profile <name>\` | Profile name to save as                                    |
| \`--env <env>\`      | Environment: \`dev\` or \`production\` (default: \`production\`) |

\`\`\`bash
nexus auth login
nexus auth login --api-key nxs_abc123
nexus auth login --profile work --api-key nxs_abc123
nexus auth login --env dev
\`\`\`

### auth logout

Remove stored credentials.

\`\`\`
nexus auth logout [name] [options]
\`\`\`

| Argument | Description                                          |
| -------- | ---------------------------------------------------- |
| \`name\`   | Specific profile to remove (default: active profile) |

| Option  | Description         |
| ------- | ------------------- |
| \`--all\` | Remove all profiles |

\`\`\`bash
nexus auth logout           # removes active profile
nexus auth logout work      # removes "work" profile
nexus auth logout --all     # removes all profiles
\`\`\`

### auth switch

Switch the active profile.

\`\`\`
nexus auth switch <name>
\`\`\`

\`\`\`bash
nexus auth switch work
nexus auth switch personal
\`\`\`

### auth list

List all saved profiles.

\`\`\`bash
nexus auth list
\`\`\`

### auth pin

Pin the current directory to a profile via \`.nexusrc\`.

\`\`\`
nexus auth pin <profile>
\`\`\`

\`\`\`bash
nexus auth pin work
\`\`\`

Creates a \`.nexusrc\` file in the current directory.

### auth unpin

Remove \`.nexusrc\` from the current directory.

\`\`\`bash
nexus auth unpin
\`\`\`

### auth status

Show resolved profile and how it was determined.

\`\`\`bash
nexus auth status
# Using profile "work" (Acme Corp) — .nexusrc at /path/to/.nexusrc
\`\`\`

Shows the profile resolution chain: \`--profile\` flag > \`NEXUS_PROFILE\` env > \`.nexusrc\` > active profile > "default".

### auth whoami

Show current authentication status (validates the API key against the server).

\`\`\`bash
nexus auth whoami
\`\`\`

---

## nexus agent

Manage AI agents.

### agent list

List agents with optional filtering.

\`\`\`
nexus agent list [options]
\`\`\`

| Option              | Description                          |
| ------------------- | ------------------------------------ |
| \`--status <status>\` | Filter by status (\`ACTIVE\`, \`DRAFT\`) |
| \`--search <query>\`  | Search by name or role               |
| \`--page <number>\`   | Page number                          |
| \`--limit <number>\`  | Items per page                       |

\`\`\`bash
nexus agent list
nexus agent list --limit 5 --status ACTIVE
nexus agent list --search "support" --json
\`\`\`

**SDK equivalent:** \`client.agents.list({ status, search, page, limit })\`

### agent get

Get agent details.

\`\`\`
nexus agent get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Agent ID    |

\`\`\`bash
nexus agent get abc-123
nexus agent get abc-123 --json
\`\`\`

**SDK equivalent:** \`client.agents.get(id)\`

### agent create

Create a new agent.

\`\`\`
nexus agent create [options]
\`\`\`

| Option                | Required | Description                                          |
| --------------------- | -------- | ---------------------------------------------------- |
| \`--first-name <name>\` | Yes      | Agent first name                                     |
| \`--last-name <name>\`  | Yes      | Agent last name                                      |
| \`--role <role>\`       | Yes      | Agent role (e.g., "Customer Support")                |
| \`--bio <text>\`        | No       | Full biography                                       |
| \`--short-bio <text>\`  | No       | Short biography for cards                            |
| \`--model <model>\`     | No       | Model ID                                             |
| \`--tone <tone>\`       | No       | Communication tone                                   |
| \`--prompt <file-or->\` | No       | System prompt (file path, or \`-\` for stdin)          |
| \`--body <json>\`       | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus agent create --first-name Ada --last-name Lovelace --role "Assistant"
nexus agent create --first-name Bot --last-name Helper --role "Support" --model gpt-4o
cat prompt.md | nexus agent create --first-name Ada --last-name Lovelace --role "Assistant" --prompt -
nexus agent create --body '{"firstName":"Ada","lastName":"Lovelace","role":"Assistant"}'
\`\`\`

**SDK equivalent:** \`client.agents.create({ firstName, lastName, role, ... })\`

### agent update

Update an agent.

\`\`\`
nexus agent update <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Agent ID    |

| Option                | Description                                          |
| --------------------- | ---------------------------------------------------- |
| \`--first-name <name>\` | Agent first name                                     |
| \`--last-name <name>\`  | Agent last name                                      |
| \`--role <role>\`       | Agent role                                           |
| \`--bio <text>\`        | Full biography                                       |
| \`--short-bio <text>\`  | Short biography                                      |
| \`--model <model>\`     | Model ID                                             |
| \`--tone <tone>\`       | Communication tone                                   |
| \`--prompt <file-or->\` | System prompt (file path, or \`-\` for stdin)          |
| \`--body <json>\`       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus agent update abc-123 --role "Senior Assistant"
echo "You are helpful" | nexus agent update abc-123 --prompt -
nexus agent update abc-123 --model gpt-4o --tone professional
nexus agent update abc-123 --body '{"tone":"friendly"}'
\`\`\`

**SDK equivalent:** \`client.agents.update(id, { ... })\`

### agent delete

Delete an agent.

\`\`\`
nexus agent delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Agent ID    |

| Option      | Description              |
| ----------- | ------------------------ |
| \`--yes\`     | Skip confirmation prompt |
| \`--dry-run\` | Preview without deleting |

\`\`\`bash
nexus agent delete abc-123
nexus agent delete abc-123 --yes
nexus agent delete abc-123 --dry-run
\`\`\`

**SDK equivalent:** \`client.agents.delete(id)\`

### agent duplicate

Duplicate an agent.

\`\`\`
nexus agent duplicate <id>
\`\`\`

| Argument | Description           |
| -------- | --------------------- |
| \`id\`     | Agent ID to duplicate |

\`\`\`bash
nexus agent duplicate abc-123
nexus agent duplicate abc-123 --json
\`\`\`

**SDK equivalent:** \`client.agents.duplicate(id)\`

---

## nexus agent-tool

Manage agent tool configurations.

### agent-tool list

List tools attached to an agent.

\`\`\`
nexus agent-tool list <agent-id>
\`\`\`

| Argument   | Description |
| ---------- | ----------- |
| \`agent-id\` | Agent ID    |

\`\`\`bash
nexus agent-tool list agt-123
nexus agent-tool list agt-123 --json
\`\`\`

**SDK equivalent:** \`client.agents.tools.list(agentId)\`

### agent-tool get

Get tool configuration details.

\`\`\`
nexus agent-tool get <agent-id> <tool-id>
\`\`\`

| Argument   | Description           |
| ---------- | --------------------- |
| \`agent-id\` | Agent ID              |
| \`tool-id\`  | Tool configuration ID |

\`\`\`bash
nexus agent-tool get agt-123 tool-456
nexus agent-tool get agt-123 tool-456 --json
\`\`\`

**SDK equivalent:** \`client.agents.tools.get(agentId, toolId)\`

### agent-tool create

Add a tool to an agent.

\`\`\`
nexus agent-tool create <agent-id> [options]
\`\`\`

| Argument   | Description |
| ---------- | ----------- |
| \`agent-id\` | Agent ID    |

| Option            | Required | Description                                                  |
| ----------------- | -------- | ------------------------------------------------------------ |
| \`--label <label>\` | Yes      | Tool label                                                   |
| \`--type <type>\`   | Yes      | Tool type (\`PLUGIN\`, \`WORKFLOW\`, \`TASK\`, \`COLLECTION\`, etc.) |
| \`--config <json>\` | No       | Tool configuration as JSON                                   |
| \`--body <json>\`   | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin         |

\`\`\`bash
nexus agent-tool create agt-123 --label "Gmail Send" --type PLUGIN
nexus agent-tool create agt-123 --label "Search KB" --type COLLECTION --config '{"collectionId":"col-789"}'
nexus agent-tool create agt-123 --body '{"label":"Search","type":"COLLECTION"}'
\`\`\`

**SDK equivalent:** \`client.agents.tools.create(agentId, { label, type, ... })\`

### agent-tool update

Update a tool configuration.

\`\`\`
nexus agent-tool update <agent-id> <tool-id> [options]
\`\`\`

| Argument   | Description           |
| ---------- | --------------------- |
| \`agent-id\` | Agent ID              |
| \`tool-id\`  | Tool configuration ID |

| Option            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| \`--label <label>\` | New label                                            |
| \`--config <json>\` | Updated configuration as JSON                        |
| \`--body <json>\`   | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus agent-tool update agt-123 tool-456 --label "Renamed Tool"
nexus agent-tool update agt-123 tool-456 --body '{"label":"Renamed"}'
\`\`\`

**SDK equivalent:** \`client.agents.tools.update(agentId, toolId, { ... })\`

### agent-tool delete

Remove a tool from an agent.

\`\`\`
nexus agent-tool delete <agent-id> <tool-id> [options]
\`\`\`

| Argument   | Description           |
| ---------- | --------------------- |
| \`agent-id\` | Agent ID              |
| \`tool-id\`  | Tool configuration ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus agent-tool delete agt-123 tool-456
nexus agent-tool delete agt-123 tool-456 --yes
\`\`\`

**SDK equivalent:** \`client.agents.tools.delete(agentId, toolId)\`

### agent-tool attach-collection

Attach a knowledge collection to an agent.

\`\`\`
nexus agent-tool attach-collection <agent-id> [options]
\`\`\`

| Argument   | Description |
| ---------- | ----------- |
| \`agent-id\` | Agent ID    |

| Option                  | Required | Description                                          |
| ----------------------- | -------- | ---------------------------------------------------- |
| \`--collection-id <id>\`  | Yes      | Collection ID                                        |
| \`--label <label>\`       | No       | Tool label                                           |
| \`--instructions <text>\` | No       | Usage instructions                                   |
| \`--body <json>\`         | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus agent-tool attach-collection agt-123 --collection-id col-456
nexus agent-tool attach-collection agt-123 --collection-id col-456 --label "FAQ Search"
\`\`\`

**SDK equivalent:** \`client.agents.tools.attachCollection(agentId, { collectionId, ... })\`

---

## nexus version

Manage agent versions.

### version list

List versions for an agent.

\`\`\`
nexus version list <agent-id> [options]
\`\`\`

| Argument   | Description |
| ---------- | ----------- |
| \`agent-id\` | Agent ID    |

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus version list agt-123
nexus version list agt-123 --limit 10 --json
\`\`\`

**SDK equivalent:** \`client.agents.versions.list(agentId, { page, limit })\`

### version get

Get version details.

\`\`\`
nexus version get <agent-id> <version-id>
\`\`\`

| Argument     | Description |
| ------------ | ----------- |
| \`agent-id\`   | Agent ID    |
| \`version-id\` | Version ID  |

\`\`\`bash
nexus version get agt-123 ver-456
nexus version get agt-123 ver-456 --json
\`\`\`

**SDK equivalent:** \`client.agents.versions.get(agentId, versionId)\`

### version create

Create a new version snapshot.

\`\`\`
nexus version create <agent-id> [options]
\`\`\`

| Argument   | Description |
| ---------- | ----------- |
| \`agent-id\` | Agent ID    |

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| \`--name <name>\`        | Version name                                         |
| \`--description <text>\` | Version description                                  |
| \`--body <json>\`        | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus version create agt-123 --name "v1.0" --description "Initial release"
nexus version create agt-123 --body '{"name":"v2.0"}'
\`\`\`

**SDK equivalent:** \`client.agents.versions.create(agentId, { name, description })\`

### version update

Update version metadata.

\`\`\`
nexus version update <agent-id> <version-id> [options]
\`\`\`

| Argument     | Description |
| ------------ | ----------- |
| \`agent-id\`   | Agent ID    |
| \`version-id\` | Version ID  |

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| \`--name <name>\`        | Version name                                         |
| \`--description <text>\` | Version description                                  |
| \`--body <json>\`        | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus version update agt-123 ver-456 --name "v1.1"
nexus version update agt-123 ver-456 --description "Bug fixes"
\`\`\`

**SDK equivalent:** \`client.agents.versions.update(agentId, versionId, { ... })\`

### version delete

Delete a version.

\`\`\`
nexus version delete <agent-id> <version-id> [options]
\`\`\`

| Argument     | Description |
| ------------ | ----------- |
| \`agent-id\`   | Agent ID    |
| \`version-id\` | Version ID  |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus version delete agt-123 ver-456
nexus version delete agt-123 ver-456 --yes
\`\`\`

**SDK equivalent:** \`client.agents.versions.delete(agentId, versionId)\`

### version restore

Restore an agent to a previous version.

\`\`\`
nexus version restore <agent-id> <version-id> [options]
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`agent-id\`   | Agent ID              |
| \`version-id\` | Version ID to restore |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus version restore agt-123 ver-456
nexus version restore agt-123 ver-456 --yes
\`\`\`

**SDK equivalent:** \`client.agents.versions.restore(agentId, versionId)\`

### version publish

Publish a version to make it live.

\`\`\`
nexus version publish <agent-id> <version-id>
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`agent-id\`   | Agent ID              |
| \`version-id\` | Version ID to publish |

\`\`\`bash
nexus version publish agt-123 ver-456
nexus version publish agt-123 ver-456 --json
\`\`\`

**SDK equivalent:** \`client.agents.versions.publish(agentId, versionId)\`

---

## nexus folder

Manage agent folders.

### folder list

List folders.

\`\`\`
nexus folder list [options]
\`\`\`

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus folder list
nexus folder list --json
\`\`\`

**SDK equivalent:** \`client.folders.list({ page, limit })\`

### folder create

Create a folder.

\`\`\`
nexus folder create [options]
\`\`\`

| Option          | Required | Description                                          |
| --------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\` | Yes      | Folder name                                          |
| \`--body <json>\` | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus folder create --name "Production Agents"
nexus folder create --body '{"name":"Staging"}'
\`\`\`

**SDK equivalent:** \`client.folders.create({ name })\`

### folder update

Update a folder.

\`\`\`
nexus folder update <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Folder ID   |

| Option          | Description                                          |
| --------------- | ---------------------------------------------------- |
| \`--name <name>\` | New folder name                                      |
| \`--body <json>\` | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus folder update fld-123 --name "Renamed Folder"
\`\`\`

**SDK equivalent:** \`client.folders.update(id, { name })\`

### folder delete

Delete a folder.

\`\`\`
nexus folder delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Folder ID   |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus folder delete fld-123
nexus folder delete fld-123 --yes
\`\`\`

**SDK equivalent:** \`client.folders.delete(id)\`

### folder assign

Assign an agent to a folder.

\`\`\`
nexus folder assign <folder-id> <agent-id>
\`\`\`

| Argument    | Description        |
| ----------- | ------------------ |
| \`folder-id\` | Folder ID          |
| \`agent-id\`  | Agent ID to assign |

\`\`\`bash
nexus folder assign fld-123 agt-456
\`\`\`

**SDK equivalent:** \`client.folders.assign(folderId, agentId)\`

---

## nexus deployment

Manage deployments (chat widgets, API endpoints, etc.).

### deployment list

List deployments.

\`\`\`
nexus deployment list [options]
\`\`\`

| Option             | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| \`--agent-id <id>\`  | Filter by agent ID                                              |
| \`--type <type>\`    | Filter by type (\`EMBED\`, \`API\`, \`WHATSAPP\`, \`TWILIO_SMS\`, etc.) |
| \`--page <number>\`  | Page number                                                     |
| \`--limit <number>\` | Items per page                                                  |

\`\`\`bash
nexus deployment list
nexus deployment list --agent-id agt-123
nexus deployment list --type CHAT --json
\`\`\`

**SDK equivalent:** \`client.deployments.list({ agentId, type, page, limit })\`

### deployment get

Get deployment details.

\`\`\`
nexus deployment get <id>
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Deployment ID |

\`\`\`bash
nexus deployment get dep-123
nexus deployment get dep-123 --json
\`\`\`

**SDK equivalent:** \`client.deployments.get(id)\`

### deployment create

Create a new deployment.

\`\`\`
nexus deployment create [options]
\`\`\`

| Option                 | Required | Description                                                                                                                 |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| \`--name <name>\`        | Yes      | Deployment name                                                                                                             |
| \`--type <type>\`        | Yes      | Deployment type: \`EMBED\`, \`API\`, \`WHATSAPP\`, \`TWILIO_SMS\`, \`TWILIO_VOICE\`, \`TELEGRAM\`, \`SLACK\`, \`GMAIL\`, \`OUTLOOK\`, \`TEAMS\` |
| \`--agent-id <id>\`      | No       | Agent ID                                                                                                                    |
| \`--description <text>\` | No       | Deployment description                                                                                                      |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin                                                                        |

**Important:** Channel deployments (WhatsApp, SMS, Voice, etc.) have prerequisites. Run \`nexus channel setup --type <TYPE>\` first to see what's needed.

\`\`\`bash
# Simple deployments (no prerequisites)
nexus deployment create --name "Website Chat" --type EMBED --agent-id agt-123
nexus deployment create --name "Support API" --type API --agent-id agt-123

# Channel deployments (require connection + phone + optional sender)
# First check prerequisites:
nexus channel setup --type WHATSAPP

# Then create with connection fields via --body:
nexus deployment create --name "WhatsApp Support" --type WHATSAPP --agent-id agt-123 \\
  --body '{"phoneNumberId":"phn-456","apiKeyConnectionId":"conn-789"}'
\`\`\`

**SDK equivalent:** \`client.deployments.create({ name, type, agentId, phoneNumberId, apiKeyConnectionId, ... })\`

### deployment update

Update a deployment.

\`\`\`
nexus deployment update <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Deployment ID |

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| \`--name <name>\`        | Deployment name                                      |
| \`--description <text>\` | Deployment description                               |
| \`--body <json>\`        | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus deployment update dep-123 --name "Updated Chat Widget"
nexus deployment update dep-123 --body '{"name":"Renamed"}'
\`\`\`

**SDK equivalent:** \`client.deployments.update(id, { ... })\`

### deployment delete

Delete a deployment.

\`\`\`
nexus deployment delete <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Deployment ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus deployment delete dep-123
nexus deployment delete dep-123 --yes
\`\`\`

**SDK equivalent:** \`client.deployments.delete(id)\`

### deployment stats

Get deployment usage statistics.

\`\`\`
nexus deployment stats <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Deployment ID |

| Option          | Description           |
| --------------- | --------------------- |
| \`--from <date>\` | Start date (ISO 8601) |
| \`--to <date>\`   | End date (ISO 8601)   |

\`\`\`bash
nexus deployment stats dep-123
nexus deployment stats dep-123 --from 2026-01-01 --to 2026-01-31
nexus deployment stats dep-123 --json
\`\`\`

**SDK equivalent:** \`client.deployments.stats(id, { from, to })\`

### deployment duplicate

Duplicate a deployment.

\`\`\`
nexus deployment duplicate <id>
\`\`\`

| Argument | Description                |
| -------- | -------------------------- |
| \`id\`     | Deployment ID to duplicate |

\`\`\`bash
nexus deployment duplicate dep-123
nexus deployment duplicate dep-123 --json
\`\`\`

**SDK equivalent:** \`client.deployments.duplicate(id)\`

### deployment embed-config

Get the embed configuration for a chat deployment.

\`\`\`
nexus deployment embed-config <id>
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Deployment ID |

\`\`\`bash
nexus deployment embed-config dep-123
nexus deployment embed-config dep-123 --json
\`\`\`

**SDK equivalent:** \`client.deployments.embedConfig(id)\`

### deployment embed-config-update

Update the embed configuration for a chat deployment.

\`\`\`
nexus deployment embed-config-update <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Deployment ID |

| Option                   | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| \`--theme <theme>\`        | Widget theme (\`light\`, \`dark\`)                       |
| \`--accent-color <color>\` | Accent color hex code                                |
| \`--position <pos>\`       | Widget position (\`bottom-right\`, \`bottom-left\`)      |
| \`--body <json>\`          | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus deployment embed-config-update dep-123 --theme dark --accent-color "#6366f1"
nexus deployment embed-config-update dep-123 --position bottom-left
nexus deployment embed-config-update dep-123 --body '{"theme":"dark"}'
\`\`\`

**SDK equivalent:** \`client.deployments.updateEmbedConfig(id, { ... })\`

---

## nexus deployment folder

Manage deployment folders.

### deployment folder list

List deployment folders.

\`\`\`
nexus deployment folder list [options]
\`\`\`

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus deployment folder list
nexus deployment folder list --json
\`\`\`

**SDK equivalent:** \`client.deployments.folders.list({ page, limit })\`

### deployment folder create

Create a deployment folder.

\`\`\`
nexus deployment folder create [options]
\`\`\`

| Option          | Required | Description                                          |
| --------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\` | Yes      | Folder name                                          |
| \`--body <json>\` | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus deployment folder create --name "Production"
\`\`\`

**SDK equivalent:** \`client.deployments.folders.create({ name })\`

### deployment folder update

Update a deployment folder.

\`\`\`
nexus deployment folder update <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Folder ID   |

| Option          | Description                                          |
| --------------- | ---------------------------------------------------- |
| \`--name <name>\` | New folder name                                      |
| \`--body <json>\` | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus deployment folder update fld-123 --name "Staging"
\`\`\`

**SDK equivalent:** \`client.deployments.folders.update(id, { name })\`

### deployment folder delete

Delete a deployment folder.

\`\`\`
nexus deployment folder delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Folder ID   |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus deployment folder delete fld-123
nexus deployment folder delete fld-123 --yes
\`\`\`

**SDK equivalent:** \`client.deployments.folders.delete(id)\`

### deployment folder assign

Assign a deployment to a folder.

\`\`\`
nexus deployment folder assign <folder-id> <deployment-id>
\`\`\`

| Argument        | Description   |
| --------------- | ------------- |
| \`folder-id\`     | Folder ID     |
| \`deployment-id\` | Deployment ID |

\`\`\`bash
nexus deployment folder assign fld-123 dep-456
\`\`\`

**SDK equivalent:** \`client.deployments.folders.assign(folderId, deploymentId)\`

---

## nexus workflow

Manage workflows.

### workflow list

List workflows.

\`\`\`
nexus workflow list [options]
\`\`\`

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| \`--status <status>\` | Filter by status (\`PUBLISHED\`, \`DRAFT\`) |
| \`--search <query>\`  | Search by name                          |
| \`--page <number>\`   | Page number                             |
| \`--limit <number>\`  | Items per page                          |

\`\`\`bash
nexus workflow list
nexus workflow list --status PUBLISHED
nexus workflow list --search "onboarding" --json
\`\`\`

**SDK equivalent:** \`client.workflows.list({ status, search, page, limit })\`

### workflow get

Get workflow details.

\`\`\`
nexus workflow get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

\`\`\`bash
nexus workflow get wf-123
nexus workflow get wf-123 --json
\`\`\`

**SDK equivalent:** \`client.workflows.get(id)\`

### workflow create

Create a new workflow.

\`\`\`
nexus workflow create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`        | Yes      | Workflow name                                        |
| \`--description <text>\` | No       | Workflow description                                 |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow create --name "Customer Onboarding"
nexus workflow create --name "Support Triage" --description "Route incoming tickets"
nexus workflow create --body '{"name":"My Workflow"}'
\`\`\`

**SDK equivalent:** \`client.workflows.create({ name, description })\`

### workflow update

Update a workflow.

\`\`\`
nexus workflow update <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| \`--name <name>\`        | Workflow name                                        |
| \`--description <text>\` | Workflow description                                 |
| \`--body <json>\`        | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow update wf-123 --name "Updated Workflow"
nexus workflow update wf-123 --body '{"description":"New description"}'
\`\`\`

**SDK equivalent:** \`client.workflows.update(id, { ... })\`

### workflow delete

Delete a workflow.

\`\`\`
nexus workflow delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus workflow delete wf-123
nexus workflow delete wf-123 --yes
\`\`\`

**SDK equivalent:** \`client.workflows.delete(id)\`

### workflow duplicate

Duplicate a workflow.

\`\`\`
nexus workflow duplicate <id>
\`\`\`

| Argument | Description              |
| -------- | ------------------------ |
| \`id\`     | Workflow ID to duplicate |

\`\`\`bash
nexus workflow duplicate wf-123
nexus workflow duplicate wf-123 --json
\`\`\`

**SDK equivalent:** \`client.workflows.duplicate(id)\`

### workflow publish

Publish a workflow.

\`\`\`
nexus workflow publish <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

\`\`\`bash
nexus workflow publish wf-123
\`\`\`

**SDK equivalent:** \`client.workflows.publish(id)\`

### workflow unpublish

Unpublish a workflow (revert to draft).

\`\`\`
nexus workflow unpublish <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

\`\`\`bash
nexus workflow unpublish wf-123
\`\`\`

**SDK equivalent:** \`client.workflows.unpublish(id)\`

### workflow validate

Validate a workflow for errors.

\`\`\`
nexus workflow validate <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

\`\`\`bash
nexus workflow validate wf-123
nexus workflow validate wf-123 --json
\`\`\`

**SDK equivalent:** \`client.workflows.validate(id)\`

### workflow test

Execute a workflow in test mode.

\`\`\`
nexus workflow test <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| \`--input <json>\` | Test input as JSON                                   |
| \`--body <json>\`  | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow test wf-123 --input '{"message":"hello"}'
nexus workflow test wf-123 --body '{"input":{"query":"test"}}'
\`\`\`

**SDK equivalent:** \`client.workflows.test(id, { input })\`

### workflow node-types

List all available node types.

\`\`\`
nexus workflow node-types
\`\`\`

\`\`\`bash
nexus workflow node-types
nexus workflow node-types --json
\`\`\`

**SDK equivalent:** \`client.workflows.nodeTypes()\`

### workflow node-type

Get details for a specific node type.

\`\`\`
nexus workflow node-type <type>
\`\`\`

| Argument | Description    |
| -------- | -------------- |
| \`type\`   | Node type name |

\`\`\`bash
nexus workflow node-type llm
nexus workflow node-type condition --json
\`\`\`

**SDK equivalent:** \`client.workflows.nodeType(type)\`

### workflow overview

Get a high-level overview of a workflow (node/edge counts, status).

\`\`\`
nexus workflow overview <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

\`\`\`bash
nexus workflow overview wf-123
nexus workflow overview wf-123 --json
\`\`\`

**SDK equivalent:** \`client.workflows.overview(id)\`

### workflow layout

Auto-layout the workflow graph.

\`\`\`
nexus workflow layout <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

\`\`\`bash
nexus workflow layout wf-123
\`\`\`

**SDK equivalent:** \`client.workflows.layout(id)\`

### workflow trigger

Get or update the workflow trigger configuration.

\`\`\`
nexus workflow trigger <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Workflow ID |

| Option            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| \`--type <type>\`   | Trigger type (\`MANUAL\`, \`WEBHOOK\`, \`SCHEDULE\`, etc.) |
| \`--config <json>\` | Trigger configuration as JSON                        |
| \`--body <json>\`   | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow trigger wf-123
nexus workflow trigger wf-123 --type WEBHOOK
nexus workflow trigger wf-123 --type SCHEDULE --config '{"cron":"0 9 * * *"}'
\`\`\`

**SDK equivalent:** \`client.workflows.trigger(id)\` / \`client.workflows.updateTrigger(id, { type, config })\`

---

## nexus workflow node

Manage workflow nodes.

### workflow node create

Add a node to a workflow.

\`\`\`
nexus workflow node create <workflow-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |

| Option             | Required | Description                                          |
| ------------------ | -------- | ---------------------------------------------------- |
| \`--type <type>\`    | Yes      | Node type (\`llm\`, \`condition\`, \`code\`, etc.)         |
| \`--name <name>\`    | No       | Node display name                                    |
| \`--config <json>\`  | No       | Node configuration as JSON                           |
| \`--position-x <n>\` | No       | X position on canvas                                 |
| \`--position-y <n>\` | No       | Y position on canvas                                 |
| \`--body <json>\`    | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow node create wf-123 --type llm --name "Generate Response"
nexus workflow node create wf-123 --type condition --config '{"expression":"input.score > 0.8"}'
nexus workflow node create wf-123 --type code --position-x 200 --position-y 400
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.create(workflowId, { type, name, config, ... })\`

### workflow node get

Get node details.

\`\`\`
nexus workflow node get <workflow-id> <node-id>
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

\`\`\`bash
nexus workflow node get wf-123 node-456
nexus workflow node get wf-123 node-456 --json
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.get(workflowId, nodeId)\`

### workflow node update

Update a node.

\`\`\`
nexus workflow node update <workflow-id> <node-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

| Option             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| \`--name <name>\`    | Node display name                                    |
| \`--config <json>\`  | Node configuration as JSON                           |
| \`--position-x <n>\` | X position on canvas                                 |
| \`--position-y <n>\` | Y position on canvas                                 |
| \`--body <json>\`    | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow node update wf-123 node-456 --name "Renamed Node"
nexus workflow node update wf-123 node-456 --config '{"model":"gpt-4o"}'
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.update(workflowId, nodeId, { ... })\`

### workflow node delete

Delete a node from a workflow.

\`\`\`
nexus workflow node delete <workflow-id> <node-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus workflow node delete wf-123 node-456
nexus workflow node delete wf-123 node-456 --yes
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.delete(workflowId, nodeId)\`

### workflow node test

Test a single node in isolation.

\`\`\`
nexus workflow node test <workflow-id> <node-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| \`--input <json>\` | Test input as JSON                                   |
| \`--body <json>\`  | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow node test wf-123 node-456 --input '{"text":"hello"}'
nexus workflow node test wf-123 node-456 --json
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.test(workflowId, nodeId, { input })\`

### workflow node variables

List variables available to a node.

\`\`\`
nexus workflow node variables <workflow-id> <node-id>
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

\`\`\`bash
nexus workflow node variables wf-123 node-456
nexus workflow node variables wf-123 node-456 --json
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.variables(workflowId, nodeId)\`

### workflow node output-format

Get or set the output format for a node.

\`\`\`
nexus workflow node output-format <workflow-id> <node-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

| Option              | Description                                          |
| ------------------- | ---------------------------------------------------- |
| \`--format <format>\` | Output format (\`json\`, \`text\`, \`structured\`)         |
| \`--schema <json>\`   | Output schema as JSON                                |
| \`--body <json>\`     | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow node output-format wf-123 node-456
nexus workflow node output-format wf-123 node-456 --format structured --schema '{"type":"object"}'
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.outputFormat(workflowId, nodeId)\` / \`client.workflows.nodes.updateOutputFormat(workflowId, nodeId, { ... })\`

### workflow node reload-props

Reload dynamic properties for a node (e.g., after changing type or config).

\`\`\`
nexus workflow node reload-props <workflow-id> <node-id>
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`node-id\`     | Node ID     |

\`\`\`bash
nexus workflow node reload-props wf-123 node-456
\`\`\`

**SDK equivalent:** \`client.workflows.nodes.reloadProps(workflowId, nodeId)\`

---

## nexus workflow edge

Manage workflow edges (connections between nodes).

### workflow edge create

Create an edge between two nodes.

\`\`\`
nexus workflow edge create <workflow-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |

| Option                     | Required | Description                                          |
| -------------------------- | -------- | ---------------------------------------------------- |
| \`--source <node-id>\`       | Yes      | Source node ID                                       |
| \`--target <node-id>\`       | Yes      | Target node ID                                       |
| \`--source-handle <handle>\` | No       | Source output handle                                 |
| \`--target-handle <handle>\` | No       | Target input handle                                  |
| \`--body <json>\`            | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow edge create wf-123 --source node-1 --target node-2
nexus workflow edge create wf-123 --source node-1 --target node-2 --source-handle "yes"
\`\`\`

**SDK equivalent:** \`client.workflows.edges.create(workflowId, { source, target, ... })\`

### workflow edge delete

Delete an edge.

\`\`\`
nexus workflow edge delete <workflow-id> <edge-id> [options]
\`\`\`

| Argument      | Description |
| ------------- | ----------- |
| \`workflow-id\` | Workflow ID |
| \`edge-id\`     | Edge ID     |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus workflow edge delete wf-123 edge-456
nexus workflow edge delete wf-123 edge-456 --yes
\`\`\`

**SDK equivalent:** \`client.workflows.edges.delete(workflowId, edgeId)\`

---

## nexus workflow branch

Manage branches on condition nodes.

### workflow branch list

List branches for a condition node.

\`\`\`
nexus workflow branch list <workflow-id> <node-id>
\`\`\`

| Argument      | Description       |
| ------------- | ----------------- |
| \`workflow-id\` | Workflow ID       |
| \`node-id\`     | Condition node ID |

\`\`\`bash
nexus workflow branch list wf-123 node-456
nexus workflow branch list wf-123 node-456 --json
\`\`\`

**SDK equivalent:** \`client.workflows.branches.list(workflowId, nodeId)\`

### workflow branch create

Create a branch on a condition node.

\`\`\`
nexus workflow branch create <workflow-id> <node-id> [options]
\`\`\`

| Argument      | Description       |
| ------------- | ----------------- |
| \`workflow-id\` | Workflow ID       |
| \`node-id\`     | Condition node ID |

| Option               | Required | Description                                          |
| -------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`      | Yes      | Branch name                                          |
| \`--condition <expr>\` | No       | Condition expression                                 |
| \`--body <json>\`      | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow branch create wf-123 node-456 --name "High Priority" --condition "input.priority === 'high'"
nexus workflow branch create wf-123 node-456 --name "Default"
\`\`\`

**SDK equivalent:** \`client.workflows.branches.create(workflowId, nodeId, { name, condition })\`

### workflow branch update

Update a branch.

\`\`\`
nexus workflow branch update <workflow-id> <node-id> <branch-id> [options]
\`\`\`

| Argument      | Description       |
| ------------- | ----------------- |
| \`workflow-id\` | Workflow ID       |
| \`node-id\`     | Condition node ID |
| \`branch-id\`   | Branch ID         |

| Option               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| \`--name <name>\`      | Branch name                                          |
| \`--condition <expr>\` | Condition expression                                 |
| \`--body <json>\`      | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus workflow branch update wf-123 node-456 br-789 --name "Renamed Branch"
nexus workflow branch update wf-123 node-456 br-789 --condition "input.score > 0.9"
\`\`\`

**SDK equivalent:** \`client.workflows.branches.update(workflowId, nodeId, branchId, { ... })\`

### workflow branch delete

Delete a branch.

\`\`\`
nexus workflow branch delete <workflow-id> <node-id> <branch-id> [options]
\`\`\`

| Argument      | Description       |
| ------------- | ----------------- |
| \`workflow-id\` | Workflow ID       |
| \`node-id\`     | Condition node ID |
| \`branch-id\`   | Branch ID         |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus workflow branch delete wf-123 node-456 br-789
nexus workflow branch delete wf-123 node-456 br-789 --yes
\`\`\`

**SDK equivalent:** \`client.workflows.branches.delete(workflowId, nodeId, branchId)\`

---

## nexus execution

View and manage workflow executions.

### execution list

List workflow executions.

\`\`\`
nexus execution list [options]
\`\`\`

| Option               | Description                                               |
| -------------------- | --------------------------------------------------------- |
| \`--workflow-id <id>\` | Filter by workflow ID                                     |
| \`--status <status>\`  | Filter by status (\`COMPLETED\`, \`FAILED\`, \`RUNNING\`, etc.) |
| \`--from <date>\`      | Start date (ISO 8601)                                     |
| \`--to <date>\`        | End date (ISO 8601)                                       |
| \`--page <number>\`    | Page number                                               |
| \`--limit <number>\`   | Items per page                                            |

\`\`\`bash
nexus execution list
nexus execution list --workflow-id wf-123
nexus execution list --status FAILED --from 2026-01-01
nexus execution list --json
\`\`\`

**SDK equivalent:** \`client.executions.list({ workflowId, status, from, to, page, limit })\`

### execution get

Get execution details.

\`\`\`
nexus execution get <id>
\`\`\`

| Argument | Description  |
| -------- | ------------ |
| \`id\`     | Execution ID |

\`\`\`bash
nexus execution get exec-123
nexus execution get exec-123 --json
\`\`\`

**SDK equivalent:** \`client.executions.get(id)\`

### execution graph

Get the execution graph (visual node-by-node execution path).

\`\`\`
nexus execution graph <id>
\`\`\`

| Argument | Description  |
| -------- | ------------ |
| \`id\`     | Execution ID |

\`\`\`bash
nexus execution graph exec-123
nexus execution graph exec-123 --json
\`\`\`

**SDK equivalent:** \`client.executions.graph(id)\`

### execution output

Get the final output of an execution.

\`\`\`
nexus execution output <id>
\`\`\`

| Argument | Description  |
| -------- | ------------ |
| \`id\`     | Execution ID |

\`\`\`bash
nexus execution output exec-123
nexus execution output exec-123 --json
\`\`\`

**SDK equivalent:** \`client.executions.output(id)\`

### execution retry

Retry a failed execution.

\`\`\`
nexus execution retry <id>
\`\`\`

| Argument | Description  |
| -------- | ------------ |
| \`id\`     | Execution ID |

\`\`\`bash
nexus execution retry exec-123
nexus execution retry exec-123 --json
\`\`\`

**SDK equivalent:** \`client.executions.retry(id)\`

### execution export

Export execution data.

\`\`\`
nexus execution export <id> [options]
\`\`\`

| Argument | Description  |
| -------- | ------------ |
| \`id\`     | Execution ID |

| Option              | Description                                     |
| ------------------- | ----------------------------------------------- |
| \`--format <format>\` | Export format (\`json\`, \`csv\`) (default: \`json\`) |
| \`--output <file>\`   | Output file path                                |

\`\`\`bash
nexus execution export exec-123
nexus execution export exec-123 --format csv --output results.csv
nexus execution export exec-123 --json
\`\`\`

**SDK equivalent:** \`client.executions.export(id, { format })\`

### execution node-result

Get the result of a specific node within an execution.

\`\`\`
nexus execution node-result <execution-id> <node-id>
\`\`\`

| Argument       | Description  |
| -------------- | ------------ |
| \`execution-id\` | Execution ID |
| \`node-id\`      | Node ID      |

\`\`\`bash
nexus execution node-result exec-123 node-456
nexus execution node-result exec-123 node-456 --json
\`\`\`

**SDK equivalent:** \`client.executions.nodeResult(executionId, nodeId)\`

---

## nexus document

Manage knowledge base documents.

### document list

List documents.

\`\`\`
nexus document list [options]
\`\`\`

| Option                 | Description             |
| ---------------------- | ----------------------- |
| \`--collection-id <id>\` | Filter by collection ID |
| \`--search <query>\`     | Search by name          |
| \`--page <number>\`      | Page number             |
| \`--limit <number>\`     | Items per page          |

\`\`\`bash
nexus document list
nexus document list --collection-id col-123
nexus document list --search "handbook" --json
\`\`\`

**SDK equivalent:** \`client.documents.list({ collectionId, search, page, limit })\`

### document get

Get document details.

\`\`\`
nexus document get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Document ID |

\`\`\`bash
nexus document get doc-123
nexus document get doc-123 --json
\`\`\`

**SDK equivalent:** \`client.documents.get(id)\`

### document upload

Upload a file as a document.

\`\`\`
nexus document upload <file> [options]
\`\`\`

| Argument | Description         |
| -------- | ------------------- |
| \`file\`   | File path to upload |

| Option                 | Description                          |
| ---------------------- | ------------------------------------ |
| \`--collection-id <id>\` | Collection ID to add to              |
| \`--name <name>\`        | Document name (defaults to filename) |

\`\`\`bash
nexus document upload ./handbook.pdf
nexus document upload ./faq.txt --collection-id col-123 --name "FAQ Document"
nexus document upload ./data.csv --name "Customer Data"
\`\`\`

**SDK equivalent:** \`client.documents.upload(file, { collectionId, name })\`

### document create-text

Create a document from inline text.

\`\`\`
nexus document create-text [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`        | Yes      | Document name                                        |
| \`--text <text-or->\`    | Yes      | Text content (string, or \`-\` for stdin)              |
| \`--collection-id <id>\` | No       | Collection ID to add to                              |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus document create-text --name "Greeting" --text "Hello, welcome to support!"
echo "Long form content..." | nexus document create-text --name "Article" --text -
nexus document create-text --name "FAQ" --text "Q: How? A: Like this." --collection-id col-123
\`\`\`

**SDK equivalent:** \`client.documents.createText({ name, text, collectionId })\`

### document add-website

Add a website URL as a document source.

\`\`\`
nexus document add-website [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--url <url>\`          | Yes      | Website URL                                          |
| \`--name <name>\`        | No       | Document name (defaults to URL)                      |
| \`--collection-id <id>\` | No       | Collection ID to add to                              |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus document add-website --url "https://docs.example.com"
nexus document add-website --url "https://example.com/faq" --name "FAQ Page" --collection-id col-123
\`\`\`

**SDK equivalent:** \`client.documents.addWebsite({ url, name, collectionId })\`

### document delete

Delete a document.

\`\`\`
nexus document delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Document ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus document delete doc-123
nexus document delete doc-123 --yes
\`\`\`

**SDK equivalent:** \`client.documents.delete(id)\`

---

## nexus collection

Manage knowledge collections.

### collection list

List collections.

\`\`\`
nexus collection list [options]
\`\`\`

| Option             | Description    |
| ------------------ | -------------- |
| \`--search <query>\` | Search by name |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus collection list
nexus collection list --search "support" --json
\`\`\`

**SDK equivalent:** \`client.collections.list({ search, page, limit })\`

### collection get

Get collection details.

\`\`\`
nexus collection get <id>
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

\`\`\`bash
nexus collection get col-123
nexus collection get col-123 --json
\`\`\`

**SDK equivalent:** \`client.collections.get(id)\`

### collection create

Create a new collection.

\`\`\`
nexus collection create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`        | Yes      | Collection name                                      |
| \`--description <text>\` | No       | Collection description                               |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus collection create --name "Support KB"
nexus collection create --name "Product Docs" --description "All product documentation"
\`\`\`

**SDK equivalent:** \`client.collections.create({ name, description })\`

### collection update

Update a collection.

\`\`\`
nexus collection update <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| \`--name <name>\`        | Collection name                                      |
| \`--description <text>\` | Collection description                               |
| \`--body <json>\`        | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus collection update col-123 --name "Renamed KB"
nexus collection update col-123 --description "Updated description"
\`\`\`

**SDK equivalent:** \`client.collections.update(id, { ... })\`

### collection delete

Delete a collection.

\`\`\`
nexus collection delete <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus collection delete col-123
nexus collection delete col-123 --yes
\`\`\`

**SDK equivalent:** \`client.collections.delete(id)\`

### collection search

Search documents within a collection.

\`\`\`
nexus collection search <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

| Option             | Required | Description  |
| ------------------ | -------- | ------------ |
| \`--query <text>\`   | Yes      | Search query |
| \`--limit <number>\` | No       | Max results  |

\`\`\`bash
nexus collection search col-123 --query "refund policy"
nexus collection search col-123 --query "shipping" --limit 5 --json
\`\`\`

**SDK equivalent:** \`client.collections.search(id, { query, limit })\`

### collection documents

List documents in a collection.

\`\`\`
nexus collection documents <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus collection documents col-123
nexus collection documents col-123 --json
\`\`\`

**SDK equivalent:** \`client.collections.documents(id, { page, limit })\`

### collection attach-documents

Attach existing documents to a collection.

\`\`\`
nexus collection attach-documents <id> [options]
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

| Option                    | Required | Description                              |
| ------------------------- | -------- | ---------------------------------------- |
| \`--document-ids <ids...>\` | Yes      | Document IDs to attach (space-separated) |

\`\`\`bash
nexus collection attach-documents col-123 --document-ids doc-1 doc-2 doc-3
\`\`\`

**SDK equivalent:** \`client.collections.attachDocuments(id, { documentIds })\`

### collection remove-document

Remove a document from a collection.

\`\`\`
nexus collection remove-document <collection-id> <document-id>
\`\`\`

| Argument        | Description           |
| --------------- | --------------------- |
| \`collection-id\` | Collection ID         |
| \`document-id\`   | Document ID to remove |

\`\`\`bash
nexus collection remove-document col-123 doc-456
\`\`\`

**SDK equivalent:** \`client.collections.removeDocument(collectionId, documentId)\`

### collection stats

Get collection statistics (document count, size, etc.).

\`\`\`
nexus collection stats <id>
\`\`\`

| Argument | Description   |
| -------- | ------------- |
| \`id\`     | Collection ID |

\`\`\`bash
nexus collection stats col-123
nexus collection stats col-123 --json
\`\`\`

**SDK equivalent:** \`client.collections.stats(id)\`

---

## nexus task

Manage reusable tasks.

### task list

List tasks.

\`\`\`
nexus task list [options]
\`\`\`

| Option             | Description    |
| ------------------ | -------------- |
| \`--search <query>\` | Search by name |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus task list
nexus task list --search "summarize" --json
\`\`\`

**SDK equivalent:** \`client.tasks.list({ search, page, limit })\`

### task get

Get task details.

\`\`\`
nexus task get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Task ID     |

\`\`\`bash
nexus task get task-123
nexus task get task-123 --json
\`\`\`

**SDK equivalent:** \`client.tasks.get(id)\`

### task create

Create a new task.

\`\`\`
nexus task create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`        | Yes      | Task name                                            |
| \`--description <text>\` | No       | Task description                                     |
| \`--prompt <text-or->\`  | No       | Task prompt (string, file path, or \`-\` for stdin)    |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus task create --name "Summarize Email" --prompt "Summarize the following email:"
nexus task create --name "Extract Data" --description "Extract structured data"
cat task-prompt.md | nexus task create --name "Complex Task" --prompt -
\`\`\`

**SDK equivalent:** \`client.tasks.create({ name, description, prompt })\`

### task execute

Execute a task with input.

\`\`\`
nexus task execute <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Task ID     |

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| \`--input <json>\` | Input data as JSON                                   |
| \`--body <json>\`  | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus task execute task-123 --input '{"text":"Please summarize this..."}'
nexus task execute task-123 --body '{"input":{"email":"Hello..."}}'
nexus task execute task-123 --json
\`\`\`

**SDK equivalent:** \`client.tasks.execute(id, { input })\`

---

## nexus tool

Browse and connect external tool integrations.

### tool search

Search available tools.

\`\`\`
nexus tool search [options]
\`\`\`

| Option             | Description        |
| ------------------ | ------------------ |
| \`--query <text>\`   | Search query       |
| \`--category <cat>\` | Filter by category |
| \`--page <number>\`  | Page number        |
| \`--limit <number>\` | Items per page     |

\`\`\`bash
nexus tool search --query "email"
nexus tool search --category "communication" --json
nexus tool search --query "slack" --limit 5
\`\`\`

**SDK equivalent:** \`client.tools.search({ query, category, page, limit })\`

### tool get

Get tool details.

\`\`\`
nexus tool get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Tool ID     |

\`\`\`bash
nexus tool get tool-123
nexus tool get tool-123 --json
\`\`\`

**SDK equivalent:** \`client.tools.get(id)\`

### tool credentials

List credential configurations for a tool.

\`\`\`
nexus tool credentials <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Tool ID     |

\`\`\`bash
nexus tool credentials tool-123
nexus tool credentials tool-123 --json
\`\`\`

**SDK equivalent:** \`client.tools.credentials(id)\`

### tool connect

Connect/authenticate a tool with credentials.

\`\`\`
nexus tool connect <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Tool ID     |

| Option                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| \`--credentials <json>\` | Credentials as JSON                                  |
| \`--body <json>\`        | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus tool connect tool-123 --credentials '{"apiKey":"sk-..."}'
nexus tool connect tool-123 --body '{"credentials":{"token":"xoxb-..."}}'
\`\`\`

**SDK equivalent:** \`client.tools.connect(id, { credentials })\`

---

## nexus analytics

View analytics and feedback.

### analytics overview

Get analytics overview (conversations, messages, tokens, etc.).

\`\`\`
nexus analytics overview [options]
\`\`\`

| Option                 | Description                                       |
| ---------------------- | ------------------------------------------------- |
| \`--agent-id <id>\`      | Filter by agent ID                                |
| \`--deployment-id <id>\` | Filter by deployment ID                           |
| \`--from <date>\`        | Start date (ISO 8601)                             |
| \`--to <date>\`          | End date (ISO 8601)                               |
| \`--granularity <g>\`    | Time granularity (\`hour\`, \`day\`, \`week\`, \`month\`) |

\`\`\`bash
nexus analytics overview
nexus analytics overview --agent-id agt-123 --from 2026-01-01 --to 2026-01-31
nexus analytics overview --granularity day --json
\`\`\`

**SDK equivalent:** \`client.analytics.overview({ agentId, deploymentId, from, to, granularity })\`

### analytics feedback

Get user feedback data.

\`\`\`
nexus analytics feedback [options]
\`\`\`

| Option                 | Description                               |
| ---------------------- | ----------------------------------------- |
| \`--agent-id <id>\`      | Filter by agent ID                        |
| \`--deployment-id <id>\` | Filter by deployment ID                   |
| \`--rating <rating>\`    | Filter by rating (\`POSITIVE\`, \`NEGATIVE\`) |
| \`--from <date>\`        | Start date (ISO 8601)                     |
| \`--to <date>\`          | End date (ISO 8601)                       |
| \`--page <number>\`      | Page number                               |
| \`--limit <number>\`     | Items per page                            |

\`\`\`bash
nexus analytics feedback
nexus analytics feedback --rating NEGATIVE --from 2026-01-01
nexus analytics feedback --agent-id agt-123 --json
\`\`\`

**SDK equivalent:** \`client.analytics.feedback({ agentId, rating, from, to, page, limit })\`

### analytics export

Export analytics data.

\`\`\`
nexus analytics export [options]
\`\`\`

| Option                 | Description                                     |
| ---------------------- | ----------------------------------------------- |
| \`--agent-id <id>\`      | Filter by agent ID                              |
| \`--deployment-id <id>\` | Filter by deployment ID                         |
| \`--from <date>\`        | Start date (ISO 8601)                           |
| \`--to <date>\`          | End date (ISO 8601)                             |
| \`--format <format>\`    | Export format (\`json\`, \`csv\`) (default: \`json\`) |
| \`--output <file>\`      | Output file path                                |

\`\`\`bash
nexus analytics export --from 2026-01-01 --to 2026-01-31
nexus analytics export --format csv --output analytics.csv
nexus analytics export --agent-id agt-123 --json
\`\`\`

**SDK equivalent:** \`client.analytics.export({ agentId, from, to, format })\`

---

## nexus ticket

Manage support tickets.

> **Note:** Ticket commands use \`--data\` instead of \`--body\` for JSON input.

### ticket list

List tickets.

\`\`\`
nexus ticket list [options]
\`\`\`

| Option                  | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| \`--status <status>\`     | Filter by status (\`OPEN\`, \`IN_PROGRESS\`, \`RESOLVED\`, \`CLOSED\`) |
| \`--priority <priority>\` | Filter by priority (\`LOW\`, \`MEDIUM\`, \`HIGH\`, \`URGENT\`)         |
| \`--assignee <id>\`       | Filter by assignee ID                                          |
| \`--search <query>\`      | Search by subject                                              |
| \`--page <number>\`       | Page number                                                    |
| \`--limit <number>\`      | Items per page                                                 |

\`\`\`bash
nexus ticket list
nexus ticket list --status OPEN --priority HIGH
nexus ticket list --assignee agt-123 --json
\`\`\`

**SDK equivalent:** \`client.tickets.list({ status, priority, assignee, search, page, limit })\`

### ticket get

Get ticket details.

\`\`\`
nexus ticket get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Ticket ID   |

\`\`\`bash
nexus ticket get tkt-123
nexus ticket get tkt-123 --json
\`\`\`

**SDK equivalent:** \`client.tickets.get(id)\`

### ticket create

Create a new ticket.

\`\`\`
nexus ticket create [options]
\`\`\`

| Option                  | Required | Description                                          |
| ----------------------- | -------- | ---------------------------------------------------- |
| \`--subject <text>\`      | Yes      | Ticket subject                                       |
| \`--description <text>\`  | No       | Ticket description                                   |
| \`--priority <priority>\` | No       | Priority (\`LOW\`, \`MEDIUM\`, \`HIGH\`, \`URGENT\`)         |
| \`--assignee <id>\`       | No       | Assignee agent ID                                    |
| \`--data <json>\`         | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus ticket create --subject "Login issue" --description "User cannot log in"
nexus ticket create --subject "Bug report" --priority HIGH --assignee agt-123
nexus ticket create --data '{"subject":"API Error","priority":"URGENT"}'
\`\`\`

**SDK equivalent:** \`client.tickets.create({ subject, description, priority, assignee })\`

### ticket update

Update a ticket.

\`\`\`
nexus ticket update <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Ticket ID   |

| Option                  | Description                                          |
| ----------------------- | ---------------------------------------------------- |
| \`--status <status>\`     | Ticket status                                        |
| \`--priority <priority>\` | Ticket priority                                      |
| \`--assignee <id>\`       | Assignee agent ID                                    |
| \`--data <json>\`         | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus ticket update tkt-123 --status RESOLVED
nexus ticket update tkt-123 --priority LOW --assignee agt-456
nexus ticket update tkt-123 --data '{"status":"CLOSED"}'
\`\`\`

**SDK equivalent:** \`client.tickets.update(id, { status, priority, assignee })\`

### ticket comment

Add a comment to a ticket.

\`\`\`
nexus ticket comment <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Ticket ID   |

| Option              | Required | Description                             |
| ------------------- | -------- | --------------------------------------- |
| \`--body <text-or->\` | Yes      | Comment text (string, or \`-\` for stdin) |

> **Note:** Here \`--body\` is the comment text, not JSON.

\`\`\`bash
nexus ticket comment TKT-42 --body "This is fixed in v2.1"
echo "Detailed comment" | nexus ticket comment TKT-42 --body -
\`\`\`

**SDK equivalent:** \`client.tickets.addComment(id, { body })\`

### ticket comments

List comments on a ticket.

\`\`\`
nexus ticket comments <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Ticket ID   |

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus ticket comments tkt-123
nexus ticket comments tkt-123 --json
\`\`\`

**SDK equivalent:** \`client.tickets.comments(id, { page, limit })\`

---

## nexus api

Make raw API requests (passthrough).

\`\`\`
nexus api <method> <path> [options]
\`\`\`

| Argument | Description                                           |
| -------- | ----------------------------------------------------- |
| \`method\` | HTTP method (\`GET\`, \`POST\`, \`PUT\`, \`PATCH\`, \`DELETE\`) |
| \`path\`   | API path (e.g., \`/agents\`, \`/workflows/wf-123\`)       |

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| \`--body <json>\`  | Request body as JSON, \`.json\` file, or \`-\` for stdin |
| \`--query <json>\` | Query parameters as JSON                             |

\`\`\`bash
nexus api GET /agents
nexus api GET /agents --query '{"limit":5}'
nexus api POST /agents --body '{"firstName":"Ada","lastName":"Lovelace","role":"Dev"}'
nexus api DELETE /agents/agt-123
echo '{"name":"test"}' | nexus api POST /workflows --body -
\`\`\`

**SDK equivalent:** \`client.request(method, path, { body, query })\`

---

## nexus emulator

Test deployments in an emulated environment without real external APIs.

### emulator send

Send a message in an emulator session.

\`\`\`
nexus emulator send [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--deployment-id <id>\` | Yes      | Deployment ID                                        |
| \`--message <text>\`     | Yes      | Message to send                                      |
| \`--session-id <id>\`    | No       | Existing session ID (creates new if omitted)         |
| \`--mode <mode>\`        | No       | Emulator mode (\`standard\`, \`debug\`)                  |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus emulator send --deployment-id dep-123 --message "Hello"
nexus emulator send --deployment-id dep-123 --message "Help me" --session-id ses-456 --mode debug
nexus emulator send --body '{"deploymentId":"dep-123","message":"Hi"}'
\`\`\`

**SDK equivalent:** \`client.emulator.send({ deploymentId, message, sessionId, mode })\`

---

## nexus emulator session

Manage emulator sessions.

### emulator session create

Create a new emulator session.

\`\`\`
nexus emulator session create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--deployment-id <id>\` | Yes      | Deployment ID                                        |
| \`--mode <mode>\`        | No       | Emulator mode (\`standard\`, \`debug\`)                  |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus emulator session create --deployment-id dep-123
nexus emulator session create --deployment-id dep-123 --mode debug
\`\`\`

**SDK equivalent:** \`client.emulator.sessions.create({ deploymentId, mode })\`

### emulator session list

List emulator sessions.

\`\`\`
nexus emulator session list [options]
\`\`\`

| Option                 | Description             |
| ---------------------- | ----------------------- |
| \`--deployment-id <id>\` | Filter by deployment ID |
| \`--page <number>\`      | Page number             |
| \`--limit <number>\`     | Items per page          |

\`\`\`bash
nexus emulator session list
nexus emulator session list --deployment-id dep-123 --json
\`\`\`

**SDK equivalent:** \`client.emulator.sessions.list({ deploymentId, page, limit })\`

### emulator session get

Get emulator session details.

\`\`\`
nexus emulator session get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Session ID  |

\`\`\`bash
nexus emulator session get ses-123
nexus emulator session get ses-123 --json
\`\`\`

**SDK equivalent:** \`client.emulator.sessions.get(id)\`

### emulator session delete

Delete an emulator session.

\`\`\`
nexus emulator session delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Session ID  |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus emulator session delete ses-123
nexus emulator session delete ses-123 --yes
\`\`\`

**SDK equivalent:** \`client.emulator.sessions.delete(id)\`

---

## nexus emulator scenario

Manage emulator test scenarios.

### emulator scenario save

Save a session as a reusable test scenario.

\`\`\`
nexus emulator scenario save [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--session-id <id>\`    | Yes      | Session ID to save as scenario                       |
| \`--name <name>\`        | Yes      | Scenario name                                        |
| \`--description <text>\` | No       | Scenario description                                 |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus emulator scenario save --session-id ses-123 --name "Happy Path"
nexus emulator scenario save --session-id ses-123 --name "Edge Case" --description "Tests timeout handling"
\`\`\`

**SDK equivalent:** \`client.emulator.scenarios.save({ sessionId, name, description })\`

### emulator scenario list

List saved scenarios.

\`\`\`
nexus emulator scenario list [options]
\`\`\`

| Option                 | Description             |
| ---------------------- | ----------------------- |
| \`--deployment-id <id>\` | Filter by deployment ID |
| \`--page <number>\`      | Page number             |
| \`--limit <number>\`     | Items per page          |

\`\`\`bash
nexus emulator scenario list
nexus emulator scenario list --deployment-id dep-123 --json
\`\`\`

**SDK equivalent:** \`client.emulator.scenarios.list({ deploymentId, page, limit })\`

### emulator scenario get

Get scenario details.

\`\`\`
nexus emulator scenario get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Scenario ID |

\`\`\`bash
nexus emulator scenario get scn-123
nexus emulator scenario get scn-123 --json
\`\`\`

**SDK equivalent:** \`client.emulator.scenarios.get(id)\`

### emulator scenario replay

Replay a saved scenario.

\`\`\`
nexus emulator scenario replay <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Scenario ID |

| Option          | Description                         |
| --------------- | ----------------------------------- |
| \`--mode <mode>\` | Emulator mode (\`standard\`, \`debug\`) |

\`\`\`bash
nexus emulator scenario replay scn-123
nexus emulator scenario replay scn-123 --mode debug --json
\`\`\`

**SDK equivalent:** \`client.emulator.scenarios.replay(id, { mode })\`

### emulator scenario delete

Delete a scenario.

\`\`\`
nexus emulator scenario delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Scenario ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus emulator scenario delete scn-123
nexus emulator scenario delete scn-123 --yes
\`\`\`

**SDK equivalent:** \`client.emulator.scenarios.delete(id)\`

---

## nexus eval

Evaluate agent performance with datasets and judges.

### eval session create

Create an evaluation session.

\`\`\`
nexus eval session create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--agent-id <id>\`      | Yes      | Agent ID to evaluate                                 |
| \`--name <name>\`        | Yes      | Session name                                         |
| \`--description <text>\` | No       | Session description                                  |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus eval session create --agent-id agt-123 --name "v2.0 Eval"
nexus eval session create --agent-id agt-123 --name "Regression Test" --description "Pre-release check"
\`\`\`

**SDK equivalent:** \`client.eval.sessions.create({ agentId, name, description })\`

### eval session list

List evaluation sessions.

\`\`\`
nexus eval session list [options]
\`\`\`

| Option             | Description        |
| ------------------ | ------------------ |
| \`--agent-id <id>\`  | Filter by agent ID |
| \`--page <number>\`  | Page number        |
| \`--limit <number>\` | Items per page     |

\`\`\`bash
nexus eval session list
nexus eval session list --agent-id agt-123 --json
\`\`\`

**SDK equivalent:** \`client.eval.sessions.list({ agentId, page, limit })\`

### eval session get

Get evaluation session details.

\`\`\`
nexus eval session get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Session ID  |

\`\`\`bash
nexus eval session get eval-123
nexus eval session get eval-123 --json
\`\`\`

**SDK equivalent:** \`client.eval.sessions.get(id)\`

### eval session delete

Delete an evaluation session.

\`\`\`
nexus eval session delete <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Session ID  |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus eval session delete eval-123
nexus eval session delete eval-123 --yes
\`\`\`

**SDK equivalent:** \`client.eval.sessions.delete(id)\`

### eval dataset list

List datasets in an evaluation session.

\`\`\`
nexus eval dataset list <session-id> [options]
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`session-id\` | Evaluation session ID |

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus eval dataset list eval-123
nexus eval dataset list eval-123 --json
\`\`\`

**SDK equivalent:** \`client.eval.datasets.list(sessionId, { page, limit })\`

### eval dataset add

Add a dataset to an evaluation session.

\`\`\`
nexus eval dataset add <session-id> [options]
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`session-id\` | Evaluation session ID |

| Option           | Required | Description                                          |
| ---------------- | -------- | ---------------------------------------------------- |
| \`--file <path>\`  | No       | Upload a dataset file (CSV or JSON)                  |
| \`--name <name>\`  | No       | Dataset name                                         |
| \`--items <json>\` | No       | Inline dataset items as JSON array                   |
| \`--body <json>\`  | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus eval dataset add eval-123 --file ./test-cases.csv --name "Core Tests"
nexus eval dataset add eval-123 --items '[{"input":"hello","expected":"Hi there!"}]'
nexus eval dataset add eval-123 --body '{"name":"Edge Cases","items":[...]}'
\`\`\`

**SDK equivalent:** \`client.eval.datasets.add(sessionId, { file, name, items })\`

### eval execute

Execute an evaluation session.

\`\`\`
nexus eval execute <session-id> [options]
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`session-id\` | Evaluation session ID |

| Option               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| \`--judge <judge-id>\` | Judge to use for scoring                             |
| \`--concurrency <n>\`  | Number of parallel evaluations                       |
| \`--body <json>\`      | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus eval execute eval-123
nexus eval execute eval-123 --judge judge-accuracy --concurrency 5
nexus eval execute eval-123 --json
\`\`\`

**SDK equivalent:** \`client.eval.execute(sessionId, { judge, concurrency })\`

### eval judge

Run a judge on evaluation results.

\`\`\`
nexus eval judge <session-id> [options]
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`session-id\` | Evaluation session ID |

| Option               | Required | Description                                          |
| -------------------- | -------- | ---------------------------------------------------- |
| \`--judge <judge-id>\` | Yes      | Judge ID                                             |
| \`--body <json>\`      | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus eval judge eval-123 --judge judge-accuracy
nexus eval judge eval-123 --judge judge-relevance --json
\`\`\`

**SDK equivalent:** \`client.eval.judge(sessionId, { judge })\`

### eval results

Get evaluation results and scores.

\`\`\`
nexus eval results <session-id> [options]
\`\`\`

| Argument     | Description           |
| ------------ | --------------------- |
| \`session-id\` | Evaluation session ID |

| Option              | Description                            |
| ------------------- | -------------------------------------- |
| \`--format <format>\` | Output format (\`table\`, \`json\`, \`csv\`) |
| \`--output <file>\`   | Output file path                       |

\`\`\`bash
nexus eval results eval-123
nexus eval results eval-123 --format csv --output results.csv
nexus eval results eval-123 --json
\`\`\`

**SDK equivalent:** \`client.eval.results(sessionId)\`

### eval formats

List available dataset formats.

\`\`\`
nexus eval formats
\`\`\`

\`\`\`bash
nexus eval formats
nexus eval formats --json
\`\`\`

**SDK equivalent:** \`client.eval.formats()\`

### eval judges

List available judges.

\`\`\`
nexus eval judges
\`\`\`

\`\`\`bash
nexus eval judges
nexus eval judges --json
\`\`\`

**SDK equivalent:** \`client.eval.judges()\`

---

## nexus template

Manage and generate from agent templates.

### template list

List available templates.

\`\`\`
nexus template list [options]
\`\`\`

| Option             | Description        |
| ------------------ | ------------------ |
| \`--category <cat>\` | Filter by category |
| \`--search <query>\` | Search by name     |
| \`--page <number>\`  | Page number        |
| \`--limit <number>\` | Items per page     |

\`\`\`bash
nexus template list
nexus template list --category "customer-support"
nexus template list --search "onboarding" --json
\`\`\`

**SDK equivalent:** \`client.templates.list({ category, search, page, limit })\`

### template get

Get template details.

\`\`\`
nexus template get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Template ID |

\`\`\`bash
nexus template get tpl-123
nexus template get tpl-123 --json
\`\`\`

**SDK equivalent:** \`client.templates.get(id)\`

### template create

Create a new template.

\`\`\`
nexus template create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`        | Yes      | Template name                                        |
| \`--description <text>\` | No       | Template description                                 |
| \`--category <cat>\`     | No       | Template category                                    |
| \`--agent-id <id>\`      | No       | Base agent ID to template from                       |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus template create --name "Support Bot" --category "customer-support"
nexus template create --name "From Agent" --agent-id agt-123
nexus template create --body '{"name":"Custom","description":"A custom template"}'
\`\`\`

**SDK equivalent:** \`client.templates.create({ name, description, category, agentId })\`

### template upload

Upload a template file.

\`\`\`
nexus template upload <file> [options]
\`\`\`

| Argument | Description               |
| -------- | ------------------------- |
| \`file\`   | Template file path (JSON) |

| Option          | Description                          |
| --------------- | ------------------------------------ |
| \`--name <name>\` | Template name (defaults to filename) |

\`\`\`bash
nexus template upload ./my-template.json
nexus template upload ./template.json --name "Custom Template"
\`\`\`

**SDK equivalent:** \`client.templates.upload(file, { name })\`

### template generate

Generate an agent from a template.

\`\`\`
nexus template generate <id> [options]
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Template ID |

| Option               | Description                                          |
| -------------------- | ---------------------------------------------------- |
| \`--name <name>\`      | Name for the generated agent                         |
| \`--variables <json>\` | Template variables as JSON                           |
| \`--body <json>\`      | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus template generate tpl-123
nexus template generate tpl-123 --name "My Support Bot"
nexus template generate tpl-123 --variables '{"companyName":"Acme","industry":"SaaS"}'
\`\`\`

**SDK equivalent:** \`client.templates.generate(id, { name, variables })\`

---

## nexus external-tool

Manage custom external tools (API-based tools).

### external-tool list

List external tools.

\`\`\`
nexus external-tool list [options]
\`\`\`

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus external-tool list
nexus external-tool list --json
\`\`\`

**SDK equivalent:** \`client.externalTools.list({ page, limit })\`

### external-tool get

Get external tool details.

\`\`\`
nexus external-tool get <id>
\`\`\`

| Argument | Description      |
| -------- | ---------------- |
| \`id\`     | External tool ID |

\`\`\`bash
nexus external-tool get ext-123
nexus external-tool get ext-123 --json
\`\`\`

**SDK equivalent:** \`client.externalTools.get(id)\`

### external-tool create

Create a custom external tool.

\`\`\`
nexus external-tool create [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--name <name>\`        | Yes      | Tool name                                            |
| \`--description <text>\` | No       | Tool description                                     |
| \`--url <url>\`          | Yes      | API endpoint URL                                     |
| \`--method <method>\`    | No       | HTTP method (default: \`POST\`)                        |
| \`--headers <json>\`     | No       | Request headers as JSON                              |
| \`--parameters <json>\`  | No       | Tool parameters schema as JSON                       |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus external-tool create --name "Weather API" --url "https://api.weather.com/v1/current" --method GET
nexus external-tool create --name "Custom Lookup" --url "https://api.example.com/search" --parameters '{"query":{"type":"string"}}'
nexus external-tool create --body '{"name":"My Tool","url":"https://..."}'
\`\`\`

**SDK equivalent:** \`client.externalTools.create({ name, url, method, headers, parameters })\`

### external-tool test

Test an external tool.

\`\`\`
nexus external-tool test <id> [options]
\`\`\`

| Argument | Description      |
| -------- | ---------------- |
| \`id\`     | External tool ID |

| Option           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| \`--input <json>\` | Test input as JSON                                   |
| \`--body <json>\`  | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus external-tool test ext-123 --input '{"query":"test"}'
nexus external-tool test ext-123 --json
\`\`\`

**SDK equivalent:** \`client.externalTools.test(id, { input })\`

---

## nexus prompt-assistant

AI-powered prompt writing assistant.

### prompt-assistant chat

Send a message to the prompt assistant.

\`\`\`
nexus prompt-assistant chat [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--message <text-or->\` | Yes      | Message to send (string, or \`-\` for stdin)           |
| \`--thread-id <id>\`     | No       | Continue an existing thread                          |
| \`--agent-id <id>\`      | No       | Agent context for prompt suggestions                 |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus prompt-assistant chat --message "Help me write a customer support prompt"
nexus prompt-assistant chat --message "Make it more concise" --thread-id thr-123
nexus prompt-assistant chat --agent-id agt-123 --message "Improve this agent's prompt"
echo "Review this prompt..." | nexus prompt-assistant chat --message -
\`\`\`

**SDK equivalent:** \`client.promptAssistant.chat({ message, threadId, agentId })\`

### prompt-assistant get-thread

Get a prompt assistant thread.

\`\`\`
nexus prompt-assistant get-thread <thread-id>
\`\`\`

| Argument    | Description |
| ----------- | ----------- |
| \`thread-id\` | Thread ID   |

\`\`\`bash
nexus prompt-assistant get-thread thr-123
nexus prompt-assistant get-thread thr-123 --json
\`\`\`

**SDK equivalent:** \`client.promptAssistant.getThread(threadId)\`

### prompt-assistant delete-thread

Delete a prompt assistant thread.

\`\`\`
nexus prompt-assistant delete-thread <thread-id> [options]
\`\`\`

| Argument    | Description |
| ----------- | ----------- |
| \`thread-id\` | Thread ID   |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus prompt-assistant delete-thread thr-123
nexus prompt-assistant delete-thread thr-123 --yes
\`\`\`

**SDK equivalent:** \`client.promptAssistant.deleteThread(threadId)\`

---

## nexus model

Browse available AI models.

### model list

List available models.

\`\`\`
nexus model list [options]
\`\`\`

| Option                  | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| \`--provider <provider>\` | Filter by provider (\`openai\`, \`anthropic\`, \`google\`, etc.) |
| \`--capability <cap>\`    | Filter by capability (\`chat\`, \`embedding\`, \`vision\`, etc.) |
| \`--search <query>\`      | Search by name                                             |

\`\`\`bash
nexus model list
nexus model list --provider openai
nexus model list --capability vision --json
nexus model list --search "gpt-4"
\`\`\`

**SDK equivalent:** \`client.models.list({ provider, capability, search })\`

---

## nexus channel

Set up deployment channels: connections, phone numbers, and WhatsApp senders. Use \`nexus channel setup\` to see what's needed before creating any non-EMBED/API deployment.

### channel setup

Check or auto-provision channel setup prerequisites. Returns a step-by-step checklist.

\`\`\`
nexus channel setup [options]
\`\`\`

| Option              | Required | Description                                                         |
| ------------------- | -------- | ------------------------------------------------------------------- |
| \`--type <type>\`     | Yes      | Deployment type (\`WHATSAPP\`, \`TWILIO_SMS\`, \`TWILIO_VOICE\`, etc.)    |
| \`--auto\`            | No       | Auto-provision what is possible (e.g., create messaging connection) |
| \`--region <region>\` | No       | Region for auto-provisioning: \`us1\` or \`ie1\` (default: \`us1\`)       |

\`\`\`bash
nexus channel setup --type WHATSAPP
nexus channel setup --type WHATSAPP --auto
nexus channel setup --type TWILIO_SMS --json
\`\`\`

**SDK equivalent:** \`client.channels.getSetupStatus(type)\` / \`client.channels.autoProvision({ type, region })\`

### channel connect-waba

Open the browser to connect your WhatsApp Business Account via Meta's Embedded Signup. This step **requires a browser** and cannot be done via API.

\`\`\`
nexus channel connect-waba
\`\`\`

Opens \`{NEXUS_DASHBOARD_URL}/app/connect-waba\` in your default browser — a dedicated page with a single "Connect with Meta" button. Complete the flow, then verify with \`nexus channel setup --type WHATSAPP\`.

\`\`\`bash
nexus channel connect-waba
\`\`\`

**SDK equivalent:** N/A (browser-only step)

### channel connection list

List messaging connections for the organization.

\`\`\`
nexus channel connection list
\`\`\`

\`\`\`bash
nexus channel connection list --json
\`\`\`

**SDK equivalent:** \`client.channels.listConnections()\`

### channel connection create

Create a messaging connection (max 1 per organization via the API).

\`\`\`
nexus channel connection create [options]
\`\`\`

| Option              | Description                             |
| ------------------- | --------------------------------------- |
| \`--region <region>\` | Region: \`us1\` or \`ie1\` (default: \`us1\`) |

\`\`\`bash
nexus channel connection create
nexus channel connection create --region ie1 --json
\`\`\`

**SDK equivalent:** \`client.channels.createConnection({ region })\`

### channel whatsapp-sender list

List WhatsApp senders for the organization.

\`\`\`
nexus channel whatsapp-sender list
\`\`\`

\`\`\`bash
nexus channel whatsapp-sender list --json
\`\`\`

**SDK equivalent:** \`client.channels.listWhatsAppSenders()\`

### channel whatsapp-sender create

Create a WhatsApp sender (registers a phone number with WhatsApp Business via Meta).

\`\`\`
nexus channel whatsapp-sender create [options]
\`\`\`

| Option                   | Required | Description                                                     |
| ------------------------ | -------- | --------------------------------------------------------------- |
| \`--connection-id <id>\`   | Yes      | Messaging connection ID                                         |
| \`--phone-number-id <id>\` | Yes      | Phone number ID                                                 |
| \`--sender-name <name>\`   | Yes      | Display name for the WhatsApp sender                            |
| \`--waba-id <id>\`         | No       | WhatsApp Business Account ID (reads from connection if omitted) |

\`\`\`bash
nexus channel whatsapp-sender create \\
  --connection-id conn-123 \\
  --phone-number-id phn-456 \\
  --sender-name "My Business"
\`\`\`

**SDK equivalent:** \`client.channels.createWhatsAppSender({ connectionId, phoneNumberId, senderName, wabaId })\`

### channel whatsapp-sender get

Get WhatsApp sender details including status.

\`\`\`
nexus channel whatsapp-sender get <id>
\`\`\`

| Argument | Description |
| -------- | ----------- |
| \`id\`     | Sender ID   |

\`\`\`bash
nexus channel whatsapp-sender get sender-123 --json
\`\`\`

**SDK equivalent:** \`client.channels.getWhatsAppSender(id)\`

---

## nexus phone-number

Manage phone numbers for SMS, Voice, and WhatsApp deployments.

### phone-number search

Search available phone numbers to purchase.

\`\`\`
nexus phone-number search [options]
\`\`\`

| Option                | Description                                     |
| --------------------- | ----------------------------------------------- |
| \`--country <code>\`    | Country code (e.g., \`US\`, \`GB\`) (default: \`US\`) |
| \`--area-code <code>\`  | Area code filter                                |
| \`--contains <digits>\` | Number contains these digits                    |
| \`--limit <number>\`    | Max results                                     |

\`\`\`bash
nexus phone-number search
nexus phone-number search --country US --area-code 415
nexus phone-number search --contains 1234 --limit 10 --json
\`\`\`

**SDK equivalent:** \`client.phoneNumbers.search({ country, areaCode, contains, limit })\`

### phone-number buy

Purchase a phone number.

\`\`\`
nexus phone-number buy [options]
\`\`\`

| Option                 | Required | Description                                          |
| ---------------------- | -------- | ---------------------------------------------------- |
| \`--number <number>\`    | Yes      | Phone number to purchase (from search results)       |
| \`--deployment-id <id>\` | No       | Deployment ID to assign to                           |
| \`--body <json>\`        | No       | Request body as JSON, \`.json\` file, or \`-\` for stdin |

\`\`\`bash
nexus phone-number buy --number "+14155551234"
nexus phone-number buy --number "+14155551234" --deployment-id dep-123
\`\`\`

**SDK equivalent:** \`client.phoneNumbers.buy({ number, deploymentId })\`

### phone-number list

List owned phone numbers.

\`\`\`
nexus phone-number list [options]
\`\`\`

| Option             | Description    |
| ------------------ | -------------- |
| \`--page <number>\`  | Page number    |
| \`--limit <number>\` | Items per page |

\`\`\`bash
nexus phone-number list
nexus phone-number list --json
\`\`\`

**SDK equivalent:** \`client.phoneNumbers.list({ page, limit })\`

### phone-number get

Get phone number details.

\`\`\`
nexus phone-number get <id>
\`\`\`

| Argument | Description     |
| -------- | --------------- |
| \`id\`     | Phone number ID |

\`\`\`bash
nexus phone-number get phn-123
nexus phone-number get phn-123 --json
\`\`\`

**SDK equivalent:** \`client.phoneNumbers.get(id)\`

### phone-number release

Release (cancel) a phone number.

\`\`\`
nexus phone-number release <id> [options]
\`\`\`

| Argument | Description     |
| -------- | --------------- |
| \`id\`     | Phone number ID |

| Option  | Description       |
| ------- | ----------------- |
| \`--yes\` | Skip confirmation |

\`\`\`bash
nexus phone-number release phn-123
nexus phone-number release phn-123 --yes
\`\`\`

**SDK equivalent:** \`client.phoneNumbers.release(id)\`

---

## nexus docs

View built-in CLI documentation.

\`\`\`
nexus docs [topic] [options]
\`\`\`

| Argument | Description                                                                  |
| -------- | ---------------------------------------------------------------------------- |
| \`topic\`  | Specific topic: \`overview\`, \`commands\`, \`gotchas\`, \`input-output\`, \`recipes\` |

| Option             | Description               |
| ------------------ | ------------------------- |
| \`--list\`           | List available topics     |
| \`--search <query>\` | Search docs for a keyword |

\`\`\`bash
nexus docs                          # Print all documentation
nexus docs commands                 # Print command reference
nexus docs gotchas                  # Print common gotchas
nexus docs --list                   # List available topics
nexus docs --search "profile"       # Search for keyword
nexus docs --json                   # Output as JSON (for AI consumption)
\`\`\`

---

## nexus upgrade

Upgrade the CLI to the latest version.

\`\`\`
nexus upgrade
\`\`\`

\`\`\`bash
nexus upgrade
\`\`\`

Checks for the latest published version of \`@agent-nexus/cli\` and upgrades the global installation. Detects the package manager used (\`npm\`, \`pnpm\`, \`yarn\`) and runs the appropriate upgrade command.

**SDK equivalent:** N/A`
  },
  gotchas: {
    title: "Common Gotchas",
    description: "Common mistakes with wrong/right examples and explanations",
    content: `# Common Gotchas

Common mistakes and how to avoid them when using the Nexus CLI.

---

## 1. API key must start with \`nxs_\`

**Wrong:**

\`\`\`bash
nexus auth login --api-key sk-abc123
# Error: Invalid key format — API keys start with "nxs_".
\`\`\`

**Right:**

\`\`\`bash
nexus auth login --api-key nxs_abc123
\`\`\`

**Why:** Nexus API keys have a \`nxs_\` prefix. Copy the full key from [Settings > API Keys](https://app.nexusgpt.io/app/settings/api-keys), including the prefix.

---

## 2. CLI flags override \`--body\` fields, not the other way

**Wrong assumption:** "The \`--body\` JSON overrides my flags."

**What actually happens:**

\`\`\`bash
nexus agent create \\
  --body '{"firstName":"Ada","role":"Junior"}' \\
  --role "Senior"
# Result: role = "Senior" (flag wins)
\`\`\`

**Right mental model:** \`--body\` provides a base; individual flags override specific fields. This is intentional — you can use a JSON file as a template and override specific values with flags.

---

## 3. Stdin collision: \`--body -\` and \`--prompt -\` both read stdin

**Wrong:**

\`\`\`bash
cat data.json | nexus agent create --body - --prompt -
# Only one of them gets the stdin data; the other gets empty
\`\`\`

**Right:**

\`\`\`bash
# Use --body for structured JSON, and put the prompt in the body
nexus agent create --body '{"firstName":"Ada","lastName":"Bot","role":"QA","prompt":"You are helpful"}'

# Or use the flag for one and a file for the other
nexus agent create --body payload.json --prompt ./prompt.md
\`\`\`

**Why:** Stdin is a single stream. Only one flag can consume it.

---

## 4. Delete confirmation: use \`--yes\` in scripts and CI/CD

**Wrong (hangs in CI):**

\`\`\`bash
# In a CI pipeline:
nexus agent delete abc-123
# Waits for interactive confirmation that will never come
\`\`\`

**Right:**

\`\`\`bash
nexus agent delete abc-123 --yes
\`\`\`

**Why:** Destructive commands prompt for confirmation when running in a TTY. In non-interactive environments, the prompt hangs. Always pass \`--yes\` in scripts.

You can also preview first with \`--dry-run\`:

\`\`\`bash
nexus agent delete abc-123 --dry-run
# DRY RUN: Would delete agent "Support Bot" (abc-123)
nexus agent delete abc-123 --yes
\`\`\`

---

## 5. Always use \`--json\` when piping to \`jq\`

**Wrong:**

\`\`\`bash
nexus agent list | jq '.data[].id'
# Parse error: table output is not valid JSON
\`\`\`

**Right:**

\`\`\`bash
nexus agent list --json | jq '.data[].id'
\`\`\`

**Why:** The default output is a human-readable table with ANSI colors. It's not parseable by \`jq\` or other JSON tools. Always add \`--json\` when piping.

---

## 6. Pagination: not all results are returned by default

**Wrong assumption:** "\`nexus agent list\` returns all my agents."

**What actually happens:**

\`\`\`bash
nexus agent list
# Shows first page (default limit) with footer:
# 47 total · page 1 · more available
\`\`\`

**Right:**

\`\`\`bash
# Get a specific page
nexus agent list --page 2 --limit 50

# Or get all IDs in a script
nexus agent list --json --limit 100 | jq -r '.data[].id'
\`\`\`

**Why:** List commands are paginated. Check the \`meta.hasMore\` field (visible in \`--json\` output) to know if there are more pages.

---

## 7. The evaluation command is \`eval\`, not \`evaluation\`

**Wrong:**

\`\`\`bash
nexus evaluation session list task-123
# Unknown command "evaluation"
\`\`\`

**Right:**

\`\`\`bash
nexus eval session list task-123
\`\`\`

**Why:** The command is registered as \`eval\` in Commander.js, even though the source file is \`evaluation.ts\`.

---

## 8. Workflows must be PUBLISHED before attaching to agents

**Wrong:**

\`\`\`bash
nexus workflow create --name "My Workflow"
# Workflow is DRAFT
nexus agent-tool create agt-123 --label "My Workflow" --type WORKFLOW --config '{"workflowId":"wf-..."}'
# Error or unexpected behavior — workflow is still DRAFT
\`\`\`

**Right:**

\`\`\`bash
nexus workflow create --name "My Workflow"
# ... add nodes, edges, validate ...
nexus workflow publish wf-123
# Now it can be attached
nexus agent-tool create agt-123 --label "My Workflow" --type WORKFLOW --config '{"workflowId":"wf-123"}'
\`\`\`

**Why:** Only published workflows can be used as agent tools. Draft workflows are not executable.

---

## 9. Config file is shared with the MCP server

**What happens:**

\`\`\`bash
nexus auth login
# Saves to ~/.nexus-mcp/config.json
\`\`\`

This file is also read by \`@nexus/mcp-server\`. Logging in or out via the CLI affects the MCP server too.

**Right mental model:** \`~/.nexus-mcp/config.json\` is a shared credential store. If you need different credentials for different contexts, use environment variables:

\`\`\`bash
NEXUS_API_KEY=nxs_other_key nexus agent list
\`\`\`

---

## 10. \`--dry-run\` only works on delete commands

**Wrong:**

\`\`\`bash
nexus agent create --first-name Test --last-name Bot --role QA --dry-run
# Unknown option: --dry-run (create doesn't support it)
\`\`\`

**Right:**

\`\`\`bash
# --dry-run works on: agent delete, deployment delete, workflow delete
nexus agent delete abc-123 --dry-run
nexus deployment delete dep-123 --dry-run
nexus workflow delete wf-123 --dry-run
\`\`\`

**Why:** \`--dry-run\` is only available on destructive (delete) operations for \`agent\`, \`deployment\`, and \`workflow\` commands.

---

## 11. Ticket commands use \`--data\` instead of \`--body\`

**Wrong:**

\`\`\`bash
nexus ticket create --body '{"title":"Bug","type":"BUG"}'
# Unknown option: --body
\`\`\`

**Right:**

\`\`\`bash
nexus ticket create --data '{"title":"Bug","type":"BUG"}'
# Or use individual flags:
nexus ticket create --title "Bug" --type BUG
\`\`\`

**Why:** The ticket command uses \`--data\` for its JSON body flag, unlike all other commands which use \`--body\`. This is a minor inconsistency.

---

## 12. Collection names must be unique slugs

**Wrong:**

\`\`\`bash
nexus collection create --name "Product FAQ"
# May fail if a collection with this name already exists
\`\`\`

**Right:**

\`\`\`bash
nexus collection create --name "product-faq" --display-name "Product FAQ"
\`\`\`

**Why:** The \`--name\` field is a unique slug identifier. Use \`--display-name\` for the human-readable label.

---

## 13. The \`api\` command always outputs JSON

**What happens:**

\`\`\`bash
nexus api GET /models
# Always outputs JSON, regardless of whether --json is set
\`\`\`

The \`nexus api\` passthrough command always returns raw JSON because the API response has no predefined table format. The \`--json\` flag only affects the pretty-printing (indented vs compact).

---

## 14. \`null\` values must be passed as the string "null"

**Wrong:**

\`\`\`bash
nexus deployment update dep-123 --agent-id
# Error: missing argument
\`\`\`

**Right:**

\`\`\`bash
# Detach an agent from a deployment
nexus deployment update dep-123 --agent-id null

# Move a folder to root
nexus folder update fld-123 --parent-id null
\`\`\`

**Why:** To set a field to \`null\` (e.g., detach an agent), pass the literal string \`"null"\`. The CLI converts it to a JSON \`null\` value.

---

## 15. Profile resolution can be surprising — check with \`auth status\`

**Unexpected:**

\`\`\`bash
cd ~/projects/acme
nexus agent list
# Using profile "personal" — why?
\`\`\`

**Diagnosis:**

\`\`\`bash
nexus auth status
# Using profile "personal" (My Startup) — active profile in config
\`\`\`

**Fix:** Pin the directory to the right profile:

\`\`\`bash
nexus auth pin work
nexus agent list
# Now uses "work" profile
\`\`\`

**Why:** The CLI resolves profiles in this order: \`--profile\` flag > \`NEXUS_PROFILE\` env > \`.nexusrc\` file > active profile > "default". If no \`.nexusrc\` exists in the directory tree, it falls back to the active profile (set by \`nexus auth switch\`).

---

## 16. Auto-update runs after every command — disable in CI

**What happens:**

\`\`\`bash
nexus agent list
# Command runs... then:
# Auto-updating: 0.1.5 → 0.1.6…
# npm install -g @agent-nexus/cli@latest
\`\`\`

**In CI this is bad:** It slows down pipelines and may fail on permissions.

**Fix:**

\`\`\`bash
nexus agent list --no-auto-update
# Or set globally in CI:
export NEXUS_NO_AUTO_UPDATE=1
\`\`\`

**Why:** By default, the CLI auto-updates to the latest version after each command (checked once per day). Use \`--no-auto-update\` in scripts and CI pipelines.

---

## 17. Use \`nexus docs\` for comprehensive built-in help

\`\`\`bash
# Full documentation
nexus docs

# Specific topic
nexus docs gotchas
nexus docs recipes
nexus docs commands

# Search for a keyword
nexus docs --search "profile"

# List available topics
nexus docs --list
\`\`\`

**Why:** The \`--help\` flag shows flags and examples. \`nexus docs\` shows the full documentation including behavioral patterns, gotchas, recipes, and SDK equivalents — all bundled into the CLI binary.`
  },
  "input-output": {
    title: "Input & Output Patterns",
    description: "Deep dive on --body, stdin, --json, output modes, context banner",
    content: `# Input & Output Patterns

Deep dive into how the Nexus CLI handles input and formats output.

---

## Input: The \`--body\` Flag

Most create and update commands accept a \`--body\` flag for raw JSON input. The flag supports three input modes:

### Inline JSON

\`\`\`bash
nexus agent create --body '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}'
\`\`\`

### JSON File

\`\`\`bash
nexus agent create --body payload.json
\`\`\`

Any value ending in \`.json\` is treated as a file path. The file is read and parsed as JSON.

### Stdin

\`\`\`bash
cat payload.json | nexus agent create --body -
echo '{"firstName":"Ada"}' | nexus agent create --body -
\`\`\`

The special value \`-\` reads JSON from stdin. Useful for piping from other commands or scripts.

### Resolution Order

The \`resolveBody()\` function in \`util/body.ts\` resolves the \`--body\` value:

\`\`\`
value === "-"       → read from stdin
value.endsWith(".json") → read from file
otherwise           → parse as inline JSON string
\`\`\`

If \`--body\` is not provided, the value is \`undefined\` (no base body).

---

## Input: Flag-Over-Body Merge

When you use both \`--body\` and individual flags, the CLI merges them using \`mergeBodyWithFlags()\`. **Flags always win.**

\`\`\`bash
nexus agent create \\
  --body '{"firstName":"Ada","lastName":"Bot","role":"Junior"}' \\
  --role "Senior"
\`\`\`

Result:

\`\`\`json
{ "firstName": "Ada", "lastName": "Bot", "role": "Senior" }
\`\`\`

The merge logic:

1. Start with the \`--body\` object (or empty \`{}\` if not provided)
2. For each CLI flag with a non-\`undefined\` value, overwrite the corresponding field

This lets you use a JSON file as a template and override specific values:

\`\`\`bash
nexus agent create --body template.json --role "Custom Role" --model gpt-4o
\`\`\`

---

## Input: File-or-Stdin Flags

Flags like \`--prompt\`, \`--content\`, \`--message\`, and \`--input\` use the \`resolveInputValue()\` function, which supports three modes:

| Input                      | Behavior                     |
| -------------------------- | ---------------------------- |
| \`-\`                        | Read from stdin              |
| A path to an existing file | Read the file contents       |
| Anything else              | Use the literal string value |

\`\`\`bash
# Literal text
nexus agent create --first-name Bot --last-name Helper --role QA \\
  --prompt "You are a helpful QA assistant."

# From a file (auto-detected if the file exists)
nexus agent create --first-name Bot --last-name Helper --role QA \\
  --prompt ./prompts/qa-agent.md

# From stdin
cat prompt.md | nexus agent update abc-123 --prompt -
\`\`\`

> **Important:** File detection uses \`fs.existsSync()\`. If a file path doesn't exist, the value is treated as literal text. This means you can't accidentally reference a non-existent file — it just becomes the prompt text itself.

---

## Input: Pagination

List commands accept pagination options:

| Flag               | Description           | Default        |
| ------------------ | --------------------- | -------------- |
| \`--page <number>\`  | Page number (1-based) | Server default |
| \`--limit <number>\` | Items per page        | Server default |

\`\`\`bash
nexus agent list --page 2 --limit 50
\`\`\`

The pagination footer (in table mode) shows:

\`\`\`
47 total · page 2 · more available
\`\`\`

In JSON mode, pagination metadata is in the \`meta\` field:

\`\`\`json
{
  "data": [...],
  "meta": { "total": 47, "page": 2, "hasMore": true }
}
\`\`\`

---

## Output: Table Mode (Default for Lists)

When listing resources, the CLI displays a formatted table:

\`\`\`
ID                                    FIRST NAME       LAST NAME        ROLE                       STATUS
────────────────────────────────────  ───────────────  ───────────────  ─────────────────────────  ──────────
abc-123-def-456-ghi-789              Support          Bot              Customer Support           ACTIVE
jkl-012-mno-345-pqr-678              Sales            Agent            Lead Qualification         DRAFT

3 total · page 1 · more available
\`\`\`

Features:

- Bold headers
- Auto-calculated column widths (max 50 characters)
- Values truncated to fit column width
- Empty results show "No results."
- Pagination footer with total count

---

## Output: Record Mode (Default for Single Resources)

When viewing a single resource (\`get\`, \`create\` responses), the CLI displays key-value pairs:

\`\`\`
ID        abc-123-def-456-ghi-789
Name      Support Bot
Role      Customer Support
Status    ACTIVE
Model     gpt-4o
Created   2026-03-15T10:30:00.000Z
\`\`\`

Features:

- Bold labels with right-padding
- Labels aligned to the longest key
- Custom field formatting (e.g., booleans shown as "yes"/"no")

---

## Output: JSON Mode (\`--json\`)

Add \`--json\` to any command to get machine-readable output:

\`\`\`bash
nexus agent list --json
\`\`\`

**List commands** wrap data with metadata:

\`\`\`json
{
  "data": [{ "id": "abc-123", "firstName": "Support", "lastName": "Bot" }],
  "meta": { "total": 3, "page": 1, "hasMore": true }
}
\`\`\`

**Get/create commands** return the raw object:

\`\`\`json
{
  "id": "abc-123",
  "firstName": "Support",
  "lastName": "Bot",
  "role": "Customer Support"
}
\`\`\`

**Success messages** return structured output:

\`\`\`json
{
  "success": true,
  "id": "abc-123",
  "name": "Support Bot"
}
\`\`\`

**Errors** return error objects:

\`\`\`json
{
  "error": {
    "message": "Not found: ...",
    "hint": "Run \\"nexus agent list\\" to see available resources."
  }
}
\`\`\`

---

## Output: Success Messages

Create, update, and delete commands display a success message:

\`\`\`
✓ Agent created.
  id: abc-123
  name: Support Bot
\`\`\`

In JSON mode:

\`\`\`json
{ "success": true, "id": "abc-123", "name": "Support Bot" }
\`\`\`

---

## Output: Colors

The CLI uses ANSI 24-bit colors:

| Color    | Usage                          |
| -------- | ------------------------------ |
| **Bold** | Table headers, record labels   |
| Teal     | Version number, beta badge     |
| Orange   | Nexus branding                 |
| Green    | Success checkmark (✓)          |
| Red      | Error prefix                   |
| Yellow   | Dry run prefix, update notices |
| Dim      | Pagination footer, hints       |
| Cyan     | URLs, version numbers          |

Colors are automatically disabled when:

- \`NO_COLOR\` environment variable is set (any value)
- \`--no-color\` flag is passed
- stdout is not a TTY (piped to a file or another command)

---

## Output: Context Banner

Before every command's output, the CLI prints a one-line context banner to stderr showing the active profile:

\`\`\`
▸ work (Acme Corp) · active
\`\`\`

The format is: \`▸ <profile-name> (<org-name>) · <source>\`

Where source is one of:

- \`flag override\` — \`--profile\` flag was used
- \`env\` — \`NEXUS_PROFILE\` env var
- \`.nexusrc\` — found a \`.nexusrc\` file in directory tree
- \`active\` — the active profile from config
- \`default\` — fallback to "default" profile
- \`api-key override\` — \`--api-key\` flag or \`NEXUS_API_KEY\` env (bypasses profiles)

The banner is **suppressed** when:

- \`--json\` mode is active
- stdout is not a TTY (piped)
- Running auth, upgrade, or version commands (they handle their own output)

This helps you confirm which profile is being used, especially when multiple profiles are configured.

---

## Output: CSV (Analytics Export)

The \`nexus analytics export\` command outputs CSV directly to stdout:

\`\`\`bash
nexus analytics export > analytics.csv
nexus analytics export --time-period 30d --deployment-id dep-123 > report.csv
\`\`\`

---

## Special: The \`nexus api\` Command

The \`nexus api\` passthrough always outputs JSON (never table/record format), because raw API responses don't have a predefined display schema:

\`\`\`bash
nexus api GET /models
# Output: { "data": [...], "meta": {...} }
\`\`\`

When \`--json\` is set, the output uses compact formatting. Without \`--json\`, it uses pretty-printed (indented) formatting.`
  },
  recipes: {
    title: "Recipes",
    description: "End-to-end workflows: RAG agent, workflows, eval, multi-org, CI/CD",
    content: `# Recipes

End-to-end workflows combining multiple CLI commands. Each recipe shows a complete journey from start to finish.

---

## 1. Build a Customer Support Agent with RAG

Create an AI agent backed by a knowledge base, deploy it as a web widget, and test it.

### Prerequisites

- Nexus CLI installed and authenticated (\`nexus auth login\`)
- A PDF or text file with your knowledge content

### Steps

\`\`\`bash
# 1. Create the agent
AGENT_ID=$(nexus agent create \\
  --first-name "Support" \\
  --last-name "Bot" \\
  --role "Customer Support" \\
  --prompt "You are a helpful customer support agent. Answer questions using the knowledge base. If you don't know the answer, say so honestly." \\
  --json | jq -r '.id')
echo "Agent: $AGENT_ID"

# 2. Upload your knowledge document
DOC_ID=$(nexus document upload ./product-faq.pdf --json | jq -r '.id')
echo "Document: $DOC_ID"

# 3. Create a knowledge collection
COL_ID=$(nexus collection create \\
  --name "product-faq" \\
  --display-name "Product FAQ" \\
  --k 10 \\
  --json | jq -r '.id')
echo "Collection: $COL_ID"

# 4. Attach the document to the collection
nexus collection attach-documents $COL_ID --document-ids $DOC_ID

# 5. Attach the collection as a tool on the agent
nexus agent-tool attach-collection $AGENT_ID \\
  --collection-id $COL_ID \\
  --label "Product FAQ Search"

# 6. Deploy as a web widget
DEP_ID=$(nexus deployment create \\
  --name "Support Widget" \\
  --type web \\
  --agent-id $AGENT_ID \\
  --json | jq -r '.id')
echo "Deployment: $DEP_ID"

# 7. Test via the emulator
SESS_ID=$(nexus emulator session create $DEP_ID --json | jq -r '.id')
nexus emulator send $DEP_ID $SESS_ID --text "How do I reset my password?"

# 8. Save the test as a scenario for regression testing
nexus emulator scenario save \\
  --session-id $SESS_ID \\
  --deployment-id $DEP_ID \\
  --name "Password reset inquiry"
\`\`\`

### Verification

\`\`\`bash
# Check agent details
nexus agent get $AGENT_ID

# Check collection has the document
nexus collection documents $COL_ID

# Test a search against the collection
nexus collection search $COL_ID --query "password reset"

# Check deployment is active
nexus deployment get $DEP_ID
\`\`\`

---

## 2. Build and Deploy a Workflow

Create a workflow with nodes, wire them together, validate, test, and publish.

### Steps

\`\`\`bash
# 1. Create the workflow
WF_ID=$(nexus workflow create \\
  --name "Lead Qualification" \\
  --description "Qualify inbound leads based on company size and industry" \\
  --json | jq -r '.id')
echo "Workflow: $WF_ID"

# 2. See available node types
nexus workflow node-types

# 3. Create an agent input trigger (start node)
TRIGGER_ID=$(nexus workflow node create $WF_ID \\
  --type agentInputTrigger \\
  --json | jq -r '.id')
echo "Trigger: $TRIGGER_ID"

# 4. Create an AI task node for qualification
TASK_NODE_ID=$(nexus workflow node create $WF_ID \\
  --type aiTask \\
  --body '{"data":{"taskId":"your-task-id"}}' \\
  --json | jq -r '.id')
echo "Task node: $TASK_NODE_ID"

# 5. Create an output node
OUTPUT_ID=$(nexus workflow node create $WF_ID \\
  --type output \\
  --json | jq -r '.id')
echo "Output: $OUTPUT_ID"

# 6. Wire the nodes together with edges
nexus workflow edge create $WF_ID --source $TRIGGER_ID --target $TASK_NODE_ID
nexus workflow edge create $WF_ID --source $TASK_NODE_ID --target $OUTPUT_ID

# 7. Auto-layout the nodes
nexus workflow layout $WF_ID

# 8. Validate the workflow
nexus workflow validate $WF_ID

# 9. Test the workflow
nexus workflow test $WF_ID --input '{"message": "I run a 500-person SaaS company interested in your enterprise plan"}'

# 10. Publish
nexus workflow publish $WF_ID

# 11. Attach to an agent as a tool
nexus agent-tool create $AGENT_ID \\
  --label "Lead Qualification" \\
  --type WORKFLOW \\
  --config "{\\"workflowId\\":\\"$WF_ID\\"}"
\`\`\`

### Verification

\`\`\`bash
nexus workflow get $WF_ID          # Check status is PUBLISHED
nexus workflow overview $WF_ID     # See all nodes and their config status
\`\`\`

---

## 3. AI Task Evaluation Pipeline

Create a task, set up an evaluation session, add test data, run the evaluation, and review results.

### Steps

\`\`\`bash
# 1. Create an AI task
TASK_ID=$(nexus task create \\
  --name "Email Summarizer" \\
  --model-name gpt-4o \\
  --model-provider OPEN_AI \\
  --expected-input "Raw email text" \\
  --expected-output "2-3 sentence summary" \\
  --json | jq -r '.id')
echo "Task: $TASK_ID"

# 2. Test the task with a quick execution
nexus task execute $TASK_ID \\
  --input "Hi team, just wanted to follow up on yesterday's meeting. We agreed to launch the beta on March 15th and need the API docs ready by March 10th. Please confirm your availability for the next sprint planning on Thursday."

# 3. Create an evaluation session
SESS_ID=$(nexus eval session create $TASK_ID \\
  --name "Summarization Accuracy v1" \\
  --description "Testing summarization quality on 10 sample emails" \\
  --json | jq -r '.id')
echo "Session: $SESS_ID"

# 4. Add test dataset rows
nexus eval dataset add $TASK_ID $SESS_ID \\
  --body '{"input":"Meeting follow-up: launch beta March 15, API docs by March 10, sprint planning Thursday.","expectedOutput":"Team agreed to launch beta on March 15th with API docs due March 10th. Sprint planning scheduled for Thursday."}'

nexus eval dataset add $TASK_ID $SESS_ID \\
  --body '{"input":"Please cancel my subscription effective immediately. I have been charged twice this month.","expectedOutput":"Customer requests immediate subscription cancellation due to double billing this month."}'

# 5. Run the evaluation
nexus eval execute $TASK_ID $SESS_ID

# 6. Judge results with AI
nexus eval judge $TASK_ID $SESS_ID \\
  --body '{"judgeModel":"gpt-4o","judgePrompt":"Rate how well the summary captures the key points. Score 1-5."}'

# 7. View results
nexus eval results $TASK_ID $SESS_ID
\`\`\`

### Verification

\`\`\`bash
nexus eval session get $TASK_ID $SESS_ID  # Check session status
nexus eval dataset list $TASK_ID $SESS_ID  # Verify all rows were added
\`\`\`

---

## 4. Multi-Channel Deployment

Deploy the same agent to multiple channels and monitor analytics.

### Steps

\`\`\`bash
# 1. Create an agent (or use an existing one)
AGENT_ID="your-agent-id"

# 2. Deploy to web widget (no prerequisites)
WEB_DEP=$(nexus deployment create \\
  --name "Website Widget" \\
  --type EMBED \\
  --agent-id $AGENT_ID \\
  --json | jq -r '.id')

# 3. Deploy to WhatsApp (requires channel setup first!)
# Check what's needed:
nexus channel setup --type WHATSAPP

# Auto-provision messaging connection:
nexus channel setup --type WHATSAPP --auto

# Buy a phone number:
nexus phone-number search --country US --sms
nexus phone-number buy --phone-number "+12025551234" --country US --price 1.15

# Create WhatsApp sender (register with Meta):
CONN_ID=$(nexus channel connection list --json | jq -r '.[0].id')
PHONE_ID=$(nexus phone-number list --json | jq -r '.[0].id')
nexus channel whatsapp-sender create \\
  --connection-id $CONN_ID \\
  --phone-number-id $PHONE_ID \\
  --sender-name "My Business"

# Now create the WhatsApp deployment:
WA_DEP=$(nexus deployment create \\
  --name "WhatsApp Support" \\
  --type WHATSAPP \\
  --agent-id $AGENT_ID \\
  --body "{\\"phoneNumberId\\":\\"$PHONE_ID\\",\\"apiKeyConnectionId\\":\\"$CONN_ID\\"}" \\
  --json | jq -r '.id')

# 4. Organize deployments in a folder
FOLDER_ID=$(nexus deployment folder create --name "Production" --json | jq -r '.id')
nexus deployment folder assign --deployment-id $WEB_DEP --folder-id $FOLDER_ID
nexus deployment folder assign --deployment-id $WA_DEP --folder-id $FOLDER_ID

# 5. Get the web widget embed configuration
nexus deployment embed-config $WEB_DEP

# 7. Customize the widget
nexus deployment embed-config-update $WEB_DEP \\
  --body '{"theme":"dark","position":"bottom-right","greeting":"Hi! How can I help?"}'

# 8. Monitor analytics across all deployments
nexus analytics overview --time-period 7d

# 9. Check per-deployment stats
nexus deployment stats $WEB_DEP
nexus deployment stats $WA_DEP
nexus deployment stats $SLACK_DEP

# 10. Export analytics for reporting
nexus analytics export --time-period 30d > monthly-report.csv
\`\`\`

### Verification

\`\`\`bash
nexus deployment list --active          # See all active deployments
nexus deployment folder list            # See folder organization
nexus analytics feedback --time-period 7d  # Check user satisfaction
\`\`\`

---

## 5. Prompt Version Management

Iterate on an agent's prompt, create checkpoints, publish versions, and roll back if needed.

### Steps

\`\`\`bash
AGENT_ID="your-agent-id"

# 1. View the current prompt
nexus agent get $AGENT_ID --json | jq -r '.prompt'

# 2. Update the prompt (iterate)
nexus agent update $AGENT_ID --prompt ./prompts/v2-support-agent.md

# 3. Create a checkpoint
nexus version create $AGENT_ID \\
  --name "v2.0" \\
  --description "Added product return handling"

# 4. Test the new version via emulator
DEP_ID="your-deployment-id"
SESS_ID=$(nexus emulator session create $DEP_ID --json | jq -r '.id')
nexus emulator send $DEP_ID $SESS_ID --text "I want to return my order"

# 5. Looks good — publish to production
VERSION_ID=$(nexus version list $AGENT_ID --json | jq -r '.data[0].id')
nexus version publish $AGENT_ID $VERSION_ID

# 6. Later: a regression is found, roll back to v1
# Find the previous version
nexus version list $AGENT_ID
# Restore it
nexus version restore $AGENT_ID <previous-version-id> --yes

# 7. Create a new checkpoint after the rollback
nexus version create $AGENT_ID \\
  --name "v2.1-rollback" \\
  --description "Rolled back to v1 due to return handling regression"
\`\`\`

### Verification

\`\`\`bash
nexus version list $AGENT_ID                    # See all versions
nexus version get $AGENT_ID $VERSION_ID         # See specific version with prompt
nexus version list $AGENT_ID --type CHECKPOINT  # See only named checkpoints
\`\`\`

---

## 6. Multi-Organization Workflow

Manage multiple Nexus organizations from the same machine using profiles.

### Steps

\`\`\`bash
# 1. Log in to both organizations
nexus auth login --profile acme
# Enter API key for Acme Corp...

nexus auth login --profile startup
# Enter API key for My Startup...

# 2. Pin project directories
cd ~/projects/acme-support-bot
nexus auth pin acme

cd ~/projects/startup-mvp
nexus auth pin startup

# 3. Now commands automatically use the right profile
cd ~/projects/acme-support-bot
nexus agent list
# ▸ acme (Acme Corp) · .nexusrc
# Shows Acme Corp agents

cd ~/projects/startup-mvp
nexus agent list
# ▸ startup (My Startup) · .nexusrc
# Shows My Startup agents

# 4. Override for one-off commands
nexus agent list --profile startup  # Use startup profile regardless of directory

# 5. Check which profile is active
nexus auth status

# 6. Switch the global default
nexus auth switch acme
\`\`\`

### Verification

\`\`\`bash
nexus auth list              # See all profiles
nexus auth status            # See resolved profile + source
cat .nexusrc                 # See pinned profile for current directory
\`\`\`

---

## 7. CI/CD Pipeline Setup

Configure the CLI for non-interactive environments (GitHub Actions, Jenkins, etc.).

### Steps

\`\`\`bash
# 1. Set credentials via environment variables (no login needed)
export NEXUS_API_KEY=nxs_your_ci_key
export NEXUS_BASE_URL=https://api.nexusgpt.io

# 2. Disable auto-update (critical for CI)
export NEXUS_NO_AUTO_UPDATE=1
# Or per-command: nexus agent list --no-auto-update

# 3. Use --json for machine-readable output
AGENT_ID=$(nexus agent create \\
  --first-name "CI" --last-name "Bot" --role "Automated" \\
  --json --no-auto-update | jq -r '.id')

# 4. Use --yes to skip confirmation prompts
nexus agent delete $AGENT_ID --yes --no-auto-update

# 5. Pipe results for processing
nexus deployment list --json --no-auto-update | jq '.data[] | select(.isActive) | .id'
\`\`\`

### GitHub Actions Example

\`\`\`yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      NEXUS_API_KEY: \${{ secrets.NEXUS_API_KEY }}
      NEXUS_NO_AUTO_UPDATE: "1"
    steps:
      - run: npm install -g @agent-nexus/cli
      - run: nexus agent list --json
      - run: |
          nexus agent update \${{ vars.AGENT_ID }} \\
            --prompt ./prompts/production.md \\
            --json
\`\`\`

### Key Flags for CI

| Flag               | Purpose                          |
| ------------------ | -------------------------------- |
| \`--json\`           | Machine-readable output          |
| \`--yes\`            | Skip confirmation prompts        |
| \`--no-auto-update\` | Prevent auto-updates in CI       |
| \`--api-key\`        | Override credentials per-command |
| \`--profile\`        | Use a specific profile           |`
  }
};

export const TOPIC_LIST = ["overview", "commands", "gotchas", "input-output", "recipes"];

export const TOPIC_DESCRIPTIONS: Record<string, string> = {
  overview: "Installation, authentication, profiles, global options, quick start",
  commands: "Full reference for all 24 command groups with options and examples",
  gotchas: "Common mistakes with wrong/right examples and explanations",
  "input-output": "Deep dive on --body, stdin, --json, output modes, context banner",
  recipes: "End-to-end workflows: RAG agent, workflows, eval, multi-org, CI/CD"
};

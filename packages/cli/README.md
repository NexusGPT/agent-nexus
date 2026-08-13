# @agent-nexus/cli

Official CLI for the [Nexus](https://nexusgpt.io) AI agent platform. Manage agents, workflows, deployments, knowledge bases, and more from your terminal.

- Wraps the full [Nexus Public API v1](../sdk)
- 24 command groups, 120+ subcommands
- Table, record, and JSON output modes
- Pipe-friendly: stdin input, `--json` output, composable with `jq`
- Zero config after `nexus auth login`
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

```bash
# Install globally
npm install -g @agent-nexus/cli

# Or with pnpm
pnpm add -g @agent-nexus/cli

# Or with yarn
yarn global add @agent-nexus/cli
```

Run a one-off command without installing:

```bash
npx @agent-nexus/cli agent list
```

Verify the installation:

```bash
nexus --version
```

Upgrade to the latest version:

```bash
nexus upgrade
```

> The CLI checks for updates once per day and prints a notice to stderr when a newer version is available. This check never delays command execution.

---

## Authentication

### Interactive Login

```bash
nexus auth login
```

This opens the Nexus settings page in your browser. Copy your API key and paste it at the prompt. The key is validated against the API before being saved.

### Non-Interactive Login

For CI/CD or scripting:

```bash
# Via flag
nexus auth login --api-key nxs_abc123

# Via environment variable (no login needed)
export NEXUS_API_KEY=nxs_abc123
```

### Verify Authentication

```bash
nexus auth whoami
```

Prints the API base URL and a masked version of your key (e.g., `nxs_abc1...3def`).

### Logout

```bash
nexus auth logout
```

Removes stored credentials from `~/.nexus-mcp/config.json`.

### API Key Resolution

The CLI resolves the API key in this order (first match wins):

| Priority | Source                  | Example                              |
| -------- | ----------------------- | ------------------------------------ |
| 1        | `--api-key` flag        | `nexus agent list --api-key nxs_...` |
| 2        | `NEXUS_API_KEY` env var | `export NEXUS_API_KEY=nxs_...`       |
| 3        | Config file             | Written by `nexus auth login`        |

### Base URL Resolution

| Priority | Source                   | Default                                                                   |
| -------- | ------------------------ | ------------------------------------------------------------------------- |
| 1        | `--base-url` flag        |                                                                           |
| 2        | `NEXUS_BASE_URL` env var |                                                                           |
| 3        | Config file              |                                                                           |
| 4        | `NEXUS_ENV` env var      | `production` = `https://api.nexusgpt.io`, `dev` = `http://localhost:3001` |
| 5        | Default                  | `https://api.nexusgpt.io`                                                 |

### Multi-Profile Support

The CLI supports multiple named profiles for managing different organizations or environments.

#### Create profiles

```bash
# Interactive (opens browser, prompts for key and profile name)
nexus auth login

# Non-interactive with explicit profile name
nexus auth login --profile work --api-key nxs_abc123
nexus auth login --profile personal --api-key nxs_xyz789
```

#### Switch between profiles

```bash
nexus auth switch work
nexus auth switch personal
```

#### List all profiles

```bash
nexus auth list
#  PROFILE    ORGANIZATION   BASE URL
# ▸ work      Acme Corp      https://api.nexusgpt.io
#   personal  My Startup     https://api.nexusgpt.io
```

#### Pin a directory to a profile

Create a `.nexusrc` file in your project directory so the CLI automatically uses the right profile:

```bash
cd ~/projects/acme
nexus auth pin work
# Creates .nexusrc with { "profile": "work" }

cd ~/projects/startup
nexus auth pin personal
```

#### Check which profile is active

```bash
nexus auth status
# Using profile "work" (Acme Corp) — .nexusrc at /Users/you/projects/acme/.nexusrc
```

#### Profile Resolution Order

When determining which profile to use, the CLI checks (first match wins):

| Priority | Source                                  | Example                                    |
| -------- | --------------------------------------- | ------------------------------------------ |
| 1        | `--api-key` flag or `NEXUS_API_KEY` env | Bypasses profiles entirely                 |
| 2        | `--profile` flag                        | `nexus agent list --profile work`          |
| 3        | `NEXUS_PROFILE` env var                 | `export NEXUS_PROFILE=work`                |
| 4        | `.nexusrc` file                         | Walks up directory tree to find `.nexusrc` |
| 5        | Active profile                          | Set by `nexus auth switch`                 |
| 6        | `"default"` profile                     | Fallback                                   |

#### Remove profiles

```bash
nexus auth logout           # removes active profile
nexus auth logout work      # removes specific profile
nexus auth logout --all     # removes everything

nexus auth unpin            # removes .nexusrc from current directory
```

---

## Quick Start

A complete walkthrough: create an agent, give it a knowledge base, deploy it, and test it.

```bash
# 1. Authenticate
nexus auth login

# 2. Create an agent
nexus agent create \
  --first-name "Support" \
  --last-name "Bot" \
  --role "Customer Support" \
  --prompt "You are a helpful customer support agent. Answer questions using the knowledge base."

# 3. Upload a document to the knowledge base
nexus document upload ./product-faq.pdf

# 4. Create a collection (retrieval-augmented generation index)
nexus collection create --name "Product FAQ"

# 5. Attach the document to the collection
nexus collection attach-documents <collection-id> --document-ids <document-id>

# 6. Attach the collection as a tool on the agent
nexus agent-tool create <agent-id> \
  --type COLLECTION \
  --collection-id <collection-id> \
  --label "FAQ Search"

# 7. Deploy the agent as a web widget
nexus deployment create \
  --name "Support Widget" \
  --type web \
  --agent-id <agent-id>

# 8. Test via the emulator
nexus emulator session create <deployment-id>
nexus emulator send <deployment-id> <session-id> \
  --text "How do I reset my password?"
```

> **Tip:** Add `--json` to any command and pipe to `jq` to extract IDs:
>
> ```bash
> AGENT_ID=$(nexus agent create --first-name Bot --last-name Helper --role QA --json | jq -r '.id')
> ```

---

## Global Options

These flags are available on every command:

| Flag                  | Description                                                                  |
| --------------------- | ---------------------------------------------------------------------------- |
| `--json`              | Output results as JSON (for scripting and piping)                            |
| `--api-key <key>`     | Override the API key for this invocation                                     |
| `--base-url <url>`    | Override the API base URL                                                    |
| `--profile <name>`    | Use a specific named profile                                                 |
| `--timeout <seconds>` | HTTP request timeout in seconds (default 30; `task execute` defaults to 600) |
| `--no-auto-update`    | Disable automatic CLI updates for this invocation                            |
| `-v, --version`       | Print the CLI version and exit                                               |
| `--help`              | Show help for any command or subcommand                                      |

### Environment Variables

| Variable               | Description                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `NEXUS_API_KEY`        | API key (used when `--api-key` flag and config file are absent)                            |
| `NEXUS_BASE_URL`       | API base URL override                                                                      |
| `NEXUS_ENV`            | Environment name: `production` (default) or `dev`                                          |
| `NEXUS_PROFILE`        | Profile name override (same as `--profile` flag)                                           |
| `NEXUS_NO_AUTO_UPDATE` | Disable automatic self-updates (same as `--no-auto-update`; also implied when `CI` is set) |
| `NO_COLOR`             | Disable all color output ([no-color.org](https://no-color.org))                            |

---

## Input Patterns

The CLI offers flexible input for create and update commands.

### The `--body` Flag

Most create/update commands accept `--body` for raw JSON input:

```bash
# Inline JSON
nexus agent create --body '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}'

# From a JSON file
nexus agent create --body payload.json

# From stdin
cat payload.json | nexus agent create --body -
echo '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}' | nexus agent create --body -
```

### Flag-Over-Body Merge

When you use both `--body` and individual flags, **flags take precedence**. The body provides defaults; flags override specific fields:

```bash
# Body sets firstName and role; --role flag overrides the role field
nexus agent create \
  --body '{"firstName":"Ada","lastName":"Bot","role":"Assistant"}' \
  --role "Senior Assistant"
# Result: { firstName: "Ada", lastName: "Bot", role: "Senior Assistant" }
```

### File and Stdin Input

Flags like `--prompt`, `--content`, and `--description` accept:

| Input        | Example                                                          |
| ------------ | ---------------------------------------------------------------- |
| Literal text | `--prompt "You are a helpful agent"`                             |
| File path    | `--prompt ./system-prompt.md` (auto-detected if the file exists) |
| Stdin        | `--prompt -` (reads from stdin)                                  |

```bash
# Load a prompt from a markdown file
nexus agent create --first-name Bot --last-name Helper --role QA --prompt ./prompt.md

# Pipe a prompt from another command
generate-prompt | nexus agent update abc-123 --prompt -
```

### Pagination

List commands support pagination:

```bash
nexus agent list --page 2 --limit 50
```

The pagination footer shows `total`, `page`, and whether `more available`.

---

## Output Modes

### Table (Default for Lists)

```
ID                                    FIRST NAME       STATUS
────────────────────────────────────  ───────────────  ──────
abc-123-def-456                       Support Bot      ACTIVE
ghi-789-jkl-012                       Sales Agent      DRAFT

3 total · page 1 · more available
```

### Record (Default for Single Resources)

```
ID        abc-123-def-456
Name      Support Bot
Role      Customer Support
Status    ACTIVE
Created   2026-03-15T10:30:00.000Z
```

### JSON (`--json`)

```bash
nexus agent list --json
```

```json
{
  "data": [{ "id": "abc-123", "firstName": "Support", "lastName": "Bot", "status": "ACTIVE" }],
  "meta": { "total": 3, "page": 1, "hasMore": true }
}
```

```bash
nexus agent get abc-123 --json
```

```json
{
  "id": "abc-123",
  "firstName": "Support",
  "lastName": "Bot",
  "role": "Customer Support",
  "status": "ACTIVE"
}
```

> **Important:** Always use `--json` when piping output to `jq` or other tools. The default table output is for humans and will break parsers.

### Error Output in JSON Mode

When `--json` is active, errors are also returned as JSON:

```json
{
  "error": {
    "message": "Authentication failed — invalid or missing API key.",
    "hint": "Run \"nexus auth login\" to re-authenticate, or set NEXUS_API_KEY."
  }
}
```

---

## Commands

All commands follow the pattern: `nexus <group> <action> [arguments] [options]`

### Core Platform

| Command                                                    | Subcommands                                                      | Description               |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| [`auth`](docs/command-reference.md#nexus-auth)             | `login` `logout` `switch` `list` `pin` `unpin` `status` `whoami` | Authentication            |
| [`agent`](docs/command-reference.md#nexus-agent)           | `list` `get` `create` `update` `delete` `duplicate`              | AI agent management       |
| [`agent-tool`](docs/command-reference.md#nexus-agent-tool) | `list` `get` `create` `update` `delete`                          | Agent tool configurations |
| [`version`](docs/command-reference.md#nexus-version)       | `list` `get` `create` `update` `delete` `restore` `publish`      | Prompt version management |
| [`folder`](docs/command-reference.md#nexus-folder)         | `list` `create` `update` `delete` `assign`                       | Agent folder organization |
| [`model`](docs/command-reference.md#nexus-model)           | `list`                                                           | Available AI models       |

### Workflows & Execution

| Command                                                              | Subcommands                                                                                 | Description                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| [`workflow`](docs/command-reference.md#nexus-workflow)               | `list` `get` `create` `update` `delete` `duplicate` `publish` `unpublish` `validate` `test` | Workflow CRUD and lifecycle |
| [`workflow node`](docs/command-reference.md#nexus-workflow-node)     | `create` `get` `update` `delete` `test` `variables` `output-format` `reload-props`          | Workflow node operations    |
| [`workflow edge`](docs/command-reference.md#nexus-workflow-edge)     | `create` `delete`                                                                           | Node connections            |
| [`workflow branch`](docs/command-reference.md#nexus-workflow-branch) | `list` `create` `update` `delete`                                                           | Branching logic             |
| [`execution`](docs/command-reference.md#nexus-execution)             | `list` `get` `graph` `output` `retry` `export` `node-result`                                | Workflow execution history  |

### Knowledge & Documents

| Command                                                    | Subcommands                                                                                               | Description           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- |
| [`document`](docs/command-reference.md#nexus-document)     | `list` `get` `upload` `create-text` `add-website` `import-google-sheets` `delete`                         | Knowledge documents   |
| [`collection`](docs/command-reference.md#nexus-collection) | `list` `get` `create` `update` `delete` `search` `documents` `attach-documents` `remove-document` `stats` | Knowledge collections |

### Skills & Tasks

| Command                                                          | Subcommands                                    | Description            |
| ---------------------------------------------------------------- | ---------------------------------------------- | ---------------------- |
| [`task`](docs/command-reference.md#nexus-task)                   | `list` `get` `create` `update` `execute`       | AI task management     |
| [`template`](docs/command-reference.md#nexus-template)           | `list` `get` `create` `upload` `generate`      | Document templates     |
| [`external-tool`](docs/command-reference.md#nexus-external-tool) | `list` `get` `create` `update` `delete` `test` | OpenAPI external tools |

### Deployment & Testing

| Command                                                                  | Subcommands                                                                                      | Description                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| [`deployment`](docs/command-reference.md#nexus-deployment)               | `list` `get` `create` `update` `delete` `duplicate` `stats` `embed-config` `embed-config-update` | Agent deployments                 |
| [`deployment folder`](docs/command-reference.md#nexus-deployment-folder) | `list` `create` `update` `delete` `assign`                                                       | Deployment folder organization    |
| [`emulator`](docs/command-reference.md#nexus-emulator)                   | `send`                                                                                           | Send messages to test deployments |
| [`emulator session`](docs/command-reference.md#nexus-emulator-session)   | `create` `list` `get` `delete`                                                                   | Emulator session management       |
| [`emulator scenario`](docs/command-reference.md#nexus-emulator-scenario) | `save` `list` `get` `replay` `delete`                                                            | Save and replay test scenarios    |

### Marketplace & Discovery

| Command                                        | Subcommands                                                                                                                                    | Description                |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| [`tool`](docs/command-reference.md#nexus-tool) | `search` `get` `credentials` `connect` `resolve-options` `skills` `test` `execute` `connection-status` `create-credential` `delete-credential` | Marketplace tool discovery |

### Analytics & Operations

| Command                                                                | Subcommands                                                                           | Description                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------- |
| [`analytics`](docs/command-reference.md#nexus-analytics)               | `overview` `feedback` `export`                                                        | Organization analytics     |
| [`eval`](docs/command-reference.md#nexus-eval)                         | (subgroups: `session`, `dataset`, `execute`, `judge`, `results`, `formats`, `judges`) | AI task evaluation         |
| [`ticket`](docs/command-reference.md#nexus-ticket)                     | `list` `get` `create` `update` `comment` `comments`                                   | Bug and feature tracking   |
| [`phone-number`](docs/command-reference.md#nexus-phone-number)         | `search` `buy` `list` `get` `release`                                                 | Phone number management    |
| [`channel`](docs/command-reference.md#nexus-channel)                   | `setup` `connection list\|create` `whatsapp-sender list\|create\|get`                 | Channel setup orchestrator |
| [`prompt-assistant`](docs/command-reference.md#nexus-prompt-assistant) | `chat` `get-thread` `delete-thread`                                                   | AI-assisted prompt writing |

### Utility

| Command                                              | Subcommands                       | Description                                                                  |
| ---------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| [`api`](docs/command-reference.md#nexus-api)         | (passthrough)                     | Call any API endpoint directly                                               |
| [`docs`](docs/command-reference.md#nexus-docs)       | (topic browser)                   | View built-in documentation                                                  |
| [`upgrade`](docs/command-reference.md#nexus-upgrade) | (self-update)                     | Upgrade the CLI **binary** to latest                                         |
| `skills`                                             | `update` `list` `version` `where` | Install/refresh the bundled `.claude` (skills + CLAUDE.md) into your project |

> **Full reference:** See [docs/command-reference.md](docs/command-reference.md) for complete documentation of every command, option, and example.

### Keeping the Claude Code skills up to date

`nexus upgrade` updates the **CLI binary** only. The `.claude` behavior layer
(CLAUDE.md + `skills/`) is bundled with each CLI release, so pull the latest
into your project separately:

```bash
nexus upgrade            # 1. get the newest binary (and bundled skill set)
nexus skills update      # 2. write that .claude into your project
```

`nexus skills update` auto-detects the project's existing `.claude` folder by
walking up from the current directory (existing `.claude/` → `CLAUDE.md` →
git root), so it refreshes the owning project instead of dropping a stray
`.claude` in a subfolder. An existing, differing project `CLAUDE.md` is
**preserved** unless you pass `--force`. Use `nexus skills where` to preview
the target, `--global` for `~/.claude`, or `--dir` for an explicit path.

---

## Common Patterns

### Extract IDs with `jq`

```bash
# Get the ID of a newly created agent
AGENT_ID=$(nexus agent create \
  --first-name Bot --last-name Helper --role QA --json | jq -r '.id')
echo "Created agent: $AGENT_ID"
```

### Pipe JSON Output

```bash
# List all active agent IDs
nexus agent list --json | jq -r '.data[] | select(.status == "ACTIVE") | .id'

# Count deployments by type
nexus deployment list --json | jq '.data | group_by(.type) | map({type: .[0].type, count: length})'
```

### Bulk Operations

```bash
# Update all agents to use a specific model
nexus agent list --json | jq -r '.data[].id' | while read id; do
  nexus agent update "$id" --model gpt-4o
  echo "Updated $id"
done
```

### Raw API Passthrough

For endpoints without a dedicated CLI command:

```bash
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
```

### Suppress Confirmation Prompts (CI/CD)

```bash
# Skip delete confirmation
nexus agent delete abc-123 --yes

# Preview what would be deleted without executing
nexus agent delete abc-123 --dry-run
```

### Load Prompts from Files

```bash
# Create an agent with a prompt from a markdown file
nexus agent create \
  --first-name Support --last-name Bot --role "Customer Support" \
  --prompt ./prompts/support-agent.md

# Update an agent's prompt from stdin
cat new-prompt.md | nexus agent update abc-123 --prompt -
```

### Workflow Build Pipeline

```bash
# Create, build, validate, test, and publish in one pipeline
WF_ID=$(nexus workflow create --name "Lead Qualifier" --json | jq -r '.id')

nexus workflow node create $WF_ID --type agentInputTrigger --name "Start"
nexus workflow node create $WF_ID --type aiTask --name "Qualify" \
  --body '{"data":{"taskId":"task-123"}}'

nexus workflow validate $WF_ID
nexus workflow test $WF_ID --input '{"message":"I want to buy 100 units"}'
nexus workflow publish $WF_ID
```

---

## SDK Cross-Reference

Every CLI command maps to an SDK method. Use the SDK (`@agent-nexus/sdk`) when building applications; use the CLI for scripting and exploration.

| CLI Command                             | SDK Equivalent                                        |
| --------------------------------------- | ----------------------------------------------------- |
| `nexus agent list`                      | `client.agents.list()`                                |
| `nexus agent get <id>`                  | `client.agents.get(id)`                               |
| `nexus agent create --first-name X ...` | `client.agents.create({ firstName: "X", ... })`       |
| `nexus agent update <id> --role Y`      | `client.agents.update(id, { role: "Y" })`             |
| `nexus agent delete <id>`               | `client.agents.delete(id)`                            |
| `nexus agent-tool list <agentId>`       | `client.agents.tools.list(agentId)`                   |
| `nexus version list <agentId>`          | `client.agents.versions.list(agentId)`                |
| `nexus workflow list`                   | `client.workflows.list()`                             |
| `nexus workflow publish <id>`           | `client.workflows.publish(id)`                        |
| `nexus document upload <file>`          | `client.documents.uploadFile(file)`                   |
| `nexus collection create --name X`      | `client.documents.createCollection({ name: "X" })`    |
| `nexus deployment create --name X ...`  | `client.deployments.create({ name: "X", ... })`       |
| `nexus emulator session create <depId>` | `client.emulator.createSession(depId)`                |
| `nexus emulator send <depId> <sessId>`  | `client.emulator.sendMessage(depId, sessId, { ... })` |
| `nexus tool search --query X`           | `client.tools.search({ query: "X" })`                 |
| `nexus analytics overview`              | `client.analytics.getOverview()`                      |
| `nexus model list`                      | `client.models.list()`                                |
| `nexus ticket create --title X ...`     | `client.tickets.create({ title: "X", ... })`          |
| `nexus phone-number list`               | `client.phoneNumbers.list()`                          |
| `nexus channel setup --type WHATSAPP`   | `client.channels.getSetupStatus("WHATSAPP")`          |
| `nexus channel connection create`       | `client.channels.createConnection()`                  |
| `nexus channel whatsapp-sender create`  | `client.channels.createWhatsAppSender({ ... })`       |

> **Full SDK documentation:** See [@agent-nexus/sdk README](../sdk/README.md)

---

## Error Handling

The CLI catches all errors and prints actionable messages with hints.

### Error Types

| Error                      | Cause                                 | Hint                                                                           |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------ |
| **Authentication failed**  | Invalid, missing, or expired API key  | Run `nexus auth login` or set `NEXUS_API_KEY`                                  |
| **Not found (404)**        | Resource ID doesn't exist             | Run `nexus <resource> list` to find valid IDs                                  |
| **Validation error (422)** | Invalid request body or parameters    | Add `--json` to see the `details` field                                        |
| **Connection error**       | Network issue or wrong base URL       | Check `--base-url` and network connectivity                                    |
| **Client-side timeout**    | Response took longer than `--timeout` | Raise the limit: `--timeout <seconds>` (server may still complete the request) |
| **API error (5xx)**        | Server-side error                     | Retry after a moment; report via `nexus ticket create`                         |

### Exit Codes

| Code | Meaning                                                       |
| ---- | ------------------------------------------------------------- |
| `0`  | Success                                                       |
| `1`  | Any error (authentication, API, validation, connection, etc.) |

### Error Format

**Human-readable (default):**

```
Error: Authentication failed — invalid or missing API key.
  Run "nexus auth login" to re-authenticate, or set NEXUS_API_KEY.
```

**JSON (`--json`):**

```json
{
  "error": {
    "message": "Authentication failed — invalid or missing API key.",
    "hint": "Run \"nexus auth login\" to re-authenticate, or set NEXUS_API_KEY."
  }
}
```

---

## Troubleshooting

### "No API key found"

```
Error: No API key found. Set NEXUS_API_KEY or run:
  nexus auth login
```

**Fix:** Run `nexus auth login` or set the `NEXUS_API_KEY` environment variable.

### "Invalid key format -- keys start with nxs\_"

**Fix:** Copy the full API key from Settings > API Keys, including the `nxs_` prefix.

### "Could not reach the Nexus API"

**Fix:** Check your network connection. If using a custom base URL, verify it:

```bash
nexus auth whoami  # shows the current base URL
```

### "The request was still running after Ns, so the CLI stopped waiting"

The CLI's client-side timeout elapsed before the API responded — the server may still be processing (and completing) the request. This is not a network failure.

**Fix:** Raise the limit with the global `--timeout` flag, e.g. for a long structured-JSON generation:

```bash
nexus task execute task-123 --input "..." --timeout 900
```

`task execute` already defaults to 600 s (all other commands default to 30 s).

### "Validation failed (HTTP 401)"

**Fix:** Your API key may be expired or revoked. Regenerate it at [Settings > API Keys](https://app.nexusgpt.io/app/settings/api-keys) and run `nexus auth login` again.

### Colors Not Showing

The CLI disables colors when:

- `NO_COLOR` environment variable is set
- `--no-color` flag is passed
- stdout is not a TTY (e.g., piped to a file or another command)

### Update Check Not Working

The version check cache is stored at `~/.nexus-mcp/version-check.json`. Delete it to force a fresh check:

```bash
rm ~/.nexus-mcp/version-check.json
nexus agent list  # triggers a new check
```

### Upgrade Failed

If `nexus upgrade` fails (e.g., permission denied), run the install manually:

```bash
sudo npm install -g @agent-nexus/cli@latest
```

---

## Configuration Files

| File                              | Purpose                                                       | Permissions |
| --------------------------------- | ------------------------------------------------------------- | ----------- |
| `~/.nexus-mcp/config.json`        | Profiles with API keys and base URLs                          | `0600`      |
| `~/.nexus-mcp/version-check.json` | Update check cache (auto-managed, checked once/day)           | `0600`      |
| `.nexusrc`                        | Directory-level profile pinning (created by `nexus auth pin`) | —           |

The `~/.nexus-mcp/` directory is created with `0700` permissions. This path is shared with the [`@agent-nexus/mcp-server`](../mcp-server/) package.

### Config File Format (V2)

```json
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
```

### .nexusrc Format

```json
{ "profile": "work" }
```

Place in your project root. The CLI walks up the directory tree to find it. Consider adding `.nexusrc` to `.gitignore`.

---

## Related Resources

| Resource              | Link                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| SDK                   | [`@agent-nexus/sdk`](../sdk/README.md)                                                             |
| Product Documentation | [`packages/docs`](../docs/)                                                                        |
| Claude Code Skills    | [`claude-code-skills-nexus` (separate repo)](https://github.com/NexusGPT/claude-code-skills-nexus) |
| API Reference         | `https://api.nexusgpt.io/api/public/v1`                                                            |
| Dashboard             | [app.nexusgpt.io](https://app.nexusgpt.io)                                                         |
| CLI Command Reference | [docs/command-reference.md](docs/command-reference.md)                                             |
| Input/Output Guide    | [docs/input-output-patterns.md](docs/input-output-patterns.md)                                     |
| Common Gotchas        | [docs/gotchas.md](docs/gotchas.md)                                                                 |
| Recipes               | [docs/recipes.md](docs/recipes.md)                                                                 |
| Report Issues         | `nexus ticket create --type BUG --title "..." --description "..."`                                 |
| Request Features      | `nexus ticket create --type FEATURE_REQUEST --title "..." --description "..."`                     |

---

## Development

### CI sweep gate

Every PR that touches `packages/cli/**` runs `.github/workflows/cli-sweep.yml`, which:

1. Builds the CLI from PR sources (not npm)
2. Authenticates against staging with a CI service profile
3. Invokes `packages/cli/scripts/sweep.sh --profile ci --strict`
4. Fails the PR on any FAIL or WARN

The sweep is read-only — it never invokes mutation verbs against staging. The `--strict` flag promotes WARN to FAIL so the `--json` contract is treated as load-bearing customer-facing behaviour.

**Runbook — provisioning `NEXUS_STAGING_API_KEY`:**

The CI workflow needs a staging API key in repo secrets. Provision it like so:

1. Create a dedicated CI service org or use an existing read-only-scoped profile on staging
2. Generate an API key from that profile's settings
3. Add it to GitHub repo secrets as `NEXUS_STAGING_API_KEY` (Settings → Secrets and variables → Actions)
4. Promote `CLI: Sweep` to a required check on `staging` and `main` branch protection rules

Until the secret is in place, the workflow fails at the "Authenticate against staging" step with a clear message — the job is intentionally advisory (not required) until provisioned.

### Local sweep

You can run the same sweep locally against any profile:

```bash
# Default profile, text output
bash packages/cli/scripts/sweep.sh

# Named profile, strict mode (mirrors CI exactly)
bash packages/cli/scripts/sweep.sh --profile prod --strict

# Machine-readable output (used by the /pinguin Claude skill)
bash packages/cli/scripts/sweep.sh --profile prod --json
```

### Release process

🚨 **A release takes TWO human merges.** Your feature PR is the first. The release pull request that `release-version.yml` opens on `main` is the second, and nothing reaches npm until someone merges that one too. Waiting for a publish after a single merge is waiting for something that will not happen.

**1 — Declare the release inside your PR.** Add a changeset. Never touch the `version` field:

```bash
pnpm changeset      # pick @agent-nexus/cli, pick a bump, write one summary line
```

That writes `.changeset/<two-random-words>.md`, which you commit alongside your code. A new file per PR is exactly why two concurrent releases cannot conflict.

🚨 **A hand-edited `version` value is REFUSED, and reaching for it is the most common way to get this wrong.** `version-bump-gate.yml` runs `scripts/check-release-intent.mjs` on every PR that touches `packages/{cli,sdk,mcp-server}`, and a hand-edited version fails it with `version was hand-edited`. Editing that line does not ship faster: when a changeset is already pending for the same package it ships the change TWICE, and when the gate catches it the PR is simply red. The only version value you may write by hand is the initial `X.Y.Z` of a package your PR CREATES. A `src/**` change that deliberately releases nothing takes the `no-version-bump` label instead.

Full changeset rules, including what happens when you name the wrong package: [`.changeset/README.md`](../../.changeset/README.md).

**2 — `staging` merges to `main`,** carrying the changeset.

**3 — `release-version.yml` opens the release pull request.** On any push to `main` touching `.changeset/**` it runs `changeset version` on the fixed branch `release/version-packages`, force-pushes that branch, and opens or updates one PR titled `chore(release): version packages`. It writes nothing to `main`, so `main` keeps its changesets and every failed run is re-runnable.

**4 — A HUMAN merges that release pull request.** This is the second merge, and it is the one that publishes.

**5 — `mirror-public-packages.yml` syncs and tags.** That merge is a push to `main` by a real account, so `on: push` workflows fire. It copies the mirrored packages into the PUBLIC repository `NexusGPT/agent-nexus` and pushes `<package>-v<version>` whenever that tag is absent from the mirror. The tag step ensures by absence rather than by diff, so re-running it is safe and repairs a sync that died between commit and tag.

**6 — The mirror publishes with provenance.** The tag triggers `release-cli.yml` IN `NexusGPT/agent-nexus`, which builds and runs `pnpm pack && npm publish ./*.tgz --access public --provenance` under an OIDC trusted publisher — no `NPM_TOKEN`. Two things in that job look like omissions and are load-bearing:

- It sets no `registry-url` on `setup-node`. That input writes `//registry.npmjs.org/:_authToken=…` into `~/.npmrc`, which makes npm prefer classic-token auth and defeats OIDC.
- It packs and then calls `npm`, rather than `pnpm publish`. pnpm 10 does not forward `--provenance`.

**Which packages ride this pipeline** — read the list, do not trust one written down. From the repository root:

```bash
grep 'MIRROR_PACKAGES:' .github/workflows/mirror-public-packages.yml
```

**What is declared and waiting to ship** — the same predicate `release-version.yml` counts. From the repository root:

```bash
find .changeset -maxdepth 1 -name '*.md' ! -name 'README.md' | sort
```

**The trusted publisher is configured on the MIRROR, never on `NexusGPT/nexus`.** Trust binds one triple: repository `NexusGPT/agent-nexus`, the workflow file, and no environment. Drift in any of the three blocks the publish until trust is reconfigured from the [@agent-nexus/cli settings page](https://www.npmjs.com/package/@agent-nexus/cli/access). The published attestation records that same triple, so ask npm instead of a document:

```bash
curl -s "https://registry.npmjs.org/-/npm/v1/attestations/@agent-nexus%2fcli@$(curl -s https://registry.npmjs.org/@agent-nexus/cli/latest | jq -r .version)" \
  | jq -r '.attestations[] | select(.predicateType=="https://slsa.dev/provenance/v1") | .bundle.dsseEnvelope.payload' \
  | base64 -d | jq '.predicate.buildDefinition.externalParameters.workflow'
```

**Provenance is live.** Every published version carries a Sigstore attestation, and npm records the publisher as `GitHub Actions` rather than a person:

```bash
curl -s https://registry.npmjs.org/@agent-nexus/cli/latest \
  | jq -r '"\(.name)@\(.version)  published-by=\(._npmUser.name)  provenance=\(.dist.attestations.provenance.predicateType // "NONE")"'
```

**The publish posture is audited daily, and that audit outranks this section.** `npm-publish-auth.yml` runs `scripts/audit-npm-publish-auth.mjs` at 07:23 UTC against the live registry and fails when any `@agent-nexus` package's latest version was pushed by a human with a token. Known exceptions live in `KNOWN_GAPS` inside that script, each carrying its reason, and a waiver that outlives its problem fails the audit too. Read that run summary before believing any claim here — it re-derives the truth, and a sentence cannot.

**Idempotency:** npm refuses to re-publish an existing version and returns `403 EPUBLISHCONFLICT`. That is the correct signal, not a bug. Recovery is a new changeset, never a hand-written version.

**When a publish does not happen, work the pipeline — do not publish from a laptop.** A token publish carries no provenance, breaks the trusted-publisher posture, and the daily audit reports it as a regression that `KNOWN_GAPS` must not excuse. Find the stage that stalled instead:

- **No release PR on `main`** → read the latest `release-version.yml` run. `count=0` means no changeset was ever declared; go back to step 1.
- **Release PR merged, nothing on npm** → read the `mirror-public-packages.yml` run for that merge. Both remaining stages are idempotent and dispatchable: the mirror sync from this repository, and `release-cli.yml` in `NexusGPT/agent-nexus` with the existing `cli-v<version>` tag as its input.

---

## License

[MIT](LICENSE)

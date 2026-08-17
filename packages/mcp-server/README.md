# @agent-nexus/mcp-server

MCP bridge for the [Nexus](https://nexusgpt.io) Public API. It runs as a stdio
MCP server and forwards every request to the Nexus Public API's MCP endpoint, so
any MCP-compatible client can drive agents, conversations, deployments,
workflows, documents and more.

The tool surface is served by the API and derived from its route contracts — it
is not hand-maintained here, so the tools you see always match the live API and
can never drift. Which tools appear is scoped automatically to the permissions of
the API key you provide.

## If you already have the Nexus CLI, use it instead

`@agent-nexus/cli` ships the same bridge as `nexus mcp serve`, running on the
profile the CLI already holds. That means **no second login and no second
credential store**, and the config block it writes carries no API key at all:

```bash
npm i -g @agent-nexus/cli
nexus auth login
nexus mcp install --client claude-code --apply   # or --client claude-desktop / cursor
```

`nexus mcp tools list` and `nexus mcp call <tool>` reach the same endpoint from
the terminal, and `nexus mcp install --help` explains where each host keeps its
config.

This package remains supported and is the right choice when you do not want the
CLI installed — for example a container that only runs the bridge. What it
cannot do is follow the CLI's full profile resolution: it honours `NEXUS_PROFILE`
and the active profile, but has no `--profile` flag and does not read `.nexusrc`.

## Quick Start

Get your API key from [Settings > API Keys](https://app.nexusgpt.io/app/settings/api-keys), then add the server to your MCP client.

### Claude Code

```bash
claude mcp add --env NEXUS_API_KEY=nxs_your_key_here nexus -- npx -y @agent-nexus/mcp-server
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nexus": {
      "command": "npx",
      "args": ["-y", "@agent-nexus/mcp-server"],
      "env": {
        "NEXUS_API_KEY": "nxs_your_key_here"
      }
    }
  }
}
```

### Cursor / VS Code

Add to your MCP settings:

```json
{
  "mcpServers": {
    "nexus": {
      "command": "npx",
      "args": ["-y", "@agent-nexus/mcp-server"],
      "env": {
        "NEXUS_API_KEY": "nxs_your_key_here"
      }
    }
  }
}
```

## Configuration

| Variable                | Description                          | Default                   |
| ----------------------- | ------------------------------------ | ------------------------- |
| `NEXUS_API_KEY`         | Your API key (required)              | —                         |
| `NEXUS_BASE_URL`        | API base URL override                | `https://api.nexusgpt.io` |
| `NEXUS_ENV`             | `production` or `dev`                | `production`              |
| `NEXUS_PROFILE`         | Which stored profile to use          | the active profile        |
| `NEXUS_ORGANIZATION_ID` | Organization a cross-org key acts on | the profile's `orgId`     |

**Which organization you get.** An org-scoped key (`nxs_`) reaches exactly one
organization and needs nothing here. A personal cross-org key (`nxs_p_`) belongs
to none: the one it acts on is whatever `organization-id` names, which is
`NEXUS_ORGANIZATION_ID` if set, else the `orgId` that `nexus auth use-org` stored
on the profile. Run `nexus-mcp whoami` — it prints the key, the organization and
the profile together, because "which key" alone does not tell you which tenant a
tool call lands in.

## CLI Commands

```
nexus-mcp              Start the stdio MCP server (default)
nexus-mcp login        Store API key in ~/.nexus-mcp/config.json
nexus-mcp logout       Remove stored credentials
nexus-mcp whoami       Show current configuration
```

## Available Tools

The tools are served by the Nexus Public API and cover the agent-facing surface
of the platform — agents and their tools/versions/collections, conversations,
deployments and channels, documents, skills, workflows and their executions,
customers, tickets, analytics and more.

The list is not fixed here: ask your MCP client to list tools (the standard
`tools/list` request) to see exactly what the connected API exposes for your key.
Read-only keys see only read tools; each tool is filtered to the scopes your key
holds.

## License

MIT

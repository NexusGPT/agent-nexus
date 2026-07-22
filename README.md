<div align="center">

# agent-nexus

**Official command-line interface, TypeScript SDK and MCP server for Nexus —
the no-code platform for building AI agents that ship.**

[![@agent-nexus/cli on npm](https://img.shields.io/npm/v/@agent-nexus/cli?label=%40agent-nexus%2Fcli&logo=npm&color=cb3837)](https://www.npmjs.com/package/@agent-nexus/cli)
[![@agent-nexus/sdk on npm](https://img.shields.io/npm/v/@agent-nexus/sdk?label=%40agent-nexus%2Fsdk&logo=npm&color=cb3837)](https://www.npmjs.com/package/@agent-nexus/sdk)
[![@agent-nexus/mcp-server on npm](https://img.shields.io/npm/v/@agent-nexus/mcp-server?label=%40agent-nexus%2Fmcp-server&logo=npm&color=cb3837)](https://www.npmjs.com/package/@agent-nexus/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/@agent-nexus/cli?logo=node.js&color=339933)](https://nodejs.org)

[![Downloads](https://img.shields.io/npm/dm/@agent-nexus/cli?label=cli%20downloads&color=8a2be2)](https://www.npmjs.com/package/@agent-nexus/cli)
[![Downloads](https://img.shields.io/npm/dm/@agent-nexus/sdk?label=sdk%20downloads&color=8a2be2)](https://www.npmjs.com/package/@agent-nexus/sdk)
[![Provenance](https://img.shields.io/badge/npm%20provenance-signed-brightgreen?logo=sigstore)](https://docs.npmjs.com/generating-provenance-statements)
[![Types](https://img.shields.io/npm/types/@agent-nexus/sdk?color=3178c6&logo=typescript)](https://www.typescriptlang.org)

</div>

---

## Packages

This repository hosts the three official npm packages for working with Nexus from the terminal, from TypeScript, or from an MCP client.

| Package | What it is | Get it |
|---|---|---|
| **[`@agent-nexus/cli`](./packages/cli)** | Command-line interface — manage agents, workflows, deployments, knowledge, emulator runs, analytics, and more from your terminal or CI | `npm install -g @agent-nexus/cli` |
| **[`@agent-nexus/sdk`](./packages/sdk)** | TypeScript client library for the [Nexus Public API](https://www.npmjs.com/package/@agent-nexus/sdk) — fully typed, zero runtime dependencies | `npm install @agent-nexus/sdk` |
| **[`@agent-nexus/mcp-server`](./packages/mcp-server)** | MCP server — exposes the Public API as tools to Claude Code, Claude Desktop, Cursor and any MCP client. The tool surface is served by the API, so it can never drift | `npx -y @agent-nexus/mcp-server` |

---

## Quick start

### CLI

```bash
npm install -g @agent-nexus/cli

nexus auth login                      # interactive browser login
nexus agent list                      # see your agents
nexus agent create --name "Support"   # create one
nexus --help                          # discover the rest
```

Output is human-readable by default, switch to machine-readable with `--json`:

```bash
nexus workflow list --json | jq '.[] | {id, name, status}'
```

### SDK

```ts
import { NexusClient } from "@agent-nexus/sdk";

const nexus = new NexusClient({
  apiKey: process.env.NEXUS_API_KEY,
});

const agents = await nexus.agents.list();
const workflow = await nexus.workflows.create({
  name: "Lead enrichment",
  agentId: agents[0].id,
});
```

---

## What is Nexus?

[Nexus](https://github.com/NexusGPT) is a no-code platform for building AI agents that connect to **4000+ integrations** and deploy across **WhatsApp, Slack, Microsoft Teams, voice, embedded chat, and email**. Customers like Orange Belgium use a single Nexus agent to drive multi-million-dollar monthly revenue.

These packages let you script everything you can do in the Nexus app — from agent setup and knowledge ingestion to workflow design, deployment management, and analytics queries. Bring agent operations into your CI, scale automation across an organization, or build a custom integration on top of the same API the Nexus app uses.

---

## CLI highlights

- **23 command groups, 230+ subcommands** covering the full Nexus surface
- **Multi-profile support** — pin different environments per directory with `.nexusrc`
- **Machine-readable output** — `--json` on every read command, scriptable end-to-end
- **Embedded [Claude Code](https://claude.ai/code) skills bundle** — `nexus install` drops curated skills into your project for Claude-assisted Nexus development
- **End-to-end tested** against real staging on every release
- **Built-in emulator** — replay conversations and test deployments without touching production

## SDK highlights

- **Zero runtime dependencies** — small footprint, no transitive supply-chain surface
- **Fully typed** — every endpoint, every resource, every response shape
- **Modern transport** — works in Node 20+, Bun, Deno
- **Pagination, retries, typed errors** — built in, opt-in where it matters
- **Same API the CLI uses** — anything the CLI does, you can do programmatically

---

## Supply chain & provenance

Every published release of `@agent-nexus/cli`, `@agent-nexus/sdk` and `@agent-nexus/mcp-server` carries an [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) — a signed Sigstore bundle that ties the published tarball back to the exact GitHub Actions workflow run that built it. Verify yourself:

```bash
npm audit signatures @agent-nexus/cli
npm audit signatures @agent-nexus/sdk
```

---

## Issues and security

- **Bugs or feature requests:** [open an issue](https://github.com/NexusGPT/agent-nexus/issues/new/choose) — please use the templates
- **Security vulnerabilities:** [report privately](https://github.com/NexusGPT/agent-nexus/security/advisories/new) via GitHub's advisory flow. See [SECURITY.md](./SECURITY.md) for the full policy.

---

## About this repository

`agent-nexus` is the published face of three packages whose source is maintained in the private NexusGPT monorepo. Every merge to the monorepo automatically syncs `packages/cli/`, `packages/sdk/` and `packages/mcp-server/` here, and releases are published from this repo so that npm can attach provenance attestations.

Practically, this means **pull requests opened directly against this repo cannot be merged** — the next upstream sync would overwrite them. To propose a code change, [open an issue](https://github.com/NexusGPT/agent-nexus/issues/new/choose) with a sketch of the diff and a maintainer will land it upstream. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full flow.

---

## License

Released under the [MIT License](./LICENSE). © NexusGPT.

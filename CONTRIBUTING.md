# Contributing

Thanks for your interest in `@agent-nexus/cli`, `@agent-nexus/sdk` and `@agent-nexus/mcp-server`.

## How this repo works

This repo is an **automated, one-way mirror** of three packages that live in the private [NexusGPT/nexus](https://github.com/NexusGPT/nexus) monorepo. Every merge to the monorepo's `main` triggers a sync action that copies `packages/cli/`, `packages/sdk/` and `packages/mcp-server/` into this repo and force-pushes the result.

This means: **edits made directly here are overwritten on the next upstream merge.** That's by design — the architecture lets us publish to npm with provenance attestations (which require a public source repo) while keeping the actual development experience inside the monorepo.

## Filing bugs and feature requests

Open an issue here. Use the templates — they help us triage.

- [Bug report](https://github.com/NexusGPT/agent-nexus/issues/new?template=bug-report.yml)
- [Feature request](https://github.com/NexusGPT/agent-nexus/issues/new?template=feature-request.yml)

## Submitting code

Pull requests opened directly on this repo will be auto-closed with this same pointer. To submit a code change:

1. Fork [NexusGPT/nexus](https://github.com/NexusGPT/nexus) — wait, that's private. So instead:
2. Open an issue on this repo describing the change you want to make, with a sketch of the diff
3. A maintainer will land the change upstream and credit you in the release notes

For non-trivial changes, please open an issue first to discuss the approach before doing the work.

## Security issues

Do not open a public issue for security vulnerabilities. Use [GitHub's private vulnerability reporting](https://github.com/NexusGPT/agent-nexus/security/advisories/new). See [SECURITY.md](./SECURITY.md) for details.

## Code of conduct

Be kind. Assume good intent.

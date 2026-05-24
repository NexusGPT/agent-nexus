# agent-nexus

Public mirror of the [`@agent-nexus/cli`](https://www.npmjs.com/package/@agent-nexus/cli) and [`@agent-nexus/sdk`](https://www.npmjs.com/package/@agent-nexus/sdk) packages.

Source of truth lives in the private [NexusGPT/nexus](https://github.com/NexusGPT/nexus) monorepo. This repo is an automated, one-way mirror that exists so npm can attach provenance attestations (`Built and signed on GitHub Actions`) to every published release.

---

## Install

```bash
# CLI (global)
npm install -g @agent-nexus/cli
nexus --help

# SDK (in your project)
npm install @agent-nexus/sdk
```

Both packages publish from this repo with provenance — verifiable on each package's npm page.

---

## What lives here

```
packages/
  cli/    → @agent-nexus/cli  (Nexus command-line interface)
  sdk/    → @agent-nexus/sdk  (Official TypeScript SDK for the Nexus Public API)
```

Everything under `packages/` is mirrored from the upstream monorepo on every merge to `main` there. Do not edit these directly — edits will be overwritten by the next sync.

---

## Bug reports

[Open an issue](https://github.com/NexusGPT/agent-nexus/issues/new/choose) on this repo. We triage here.

## Code contributions

Source changes are made in the upstream monorepo and flow downstream automatically. PRs opened directly on this repo are auto-closed with a pointer — see [CONTRIBUTING.md](./CONTRIBUTING.md) for the suggested flow.

## Security

Please report vulnerabilities privately via GitHub's private vulnerability reporting — see [SECURITY.md](./SECURITY.md).

---

## Links

- Docs: [agent.nexus](https://agent.nexus)
- npm — CLI: https://www.npmjs.com/package/@agent-nexus/cli
- npm — SDK: https://www.npmjs.com/package/@agent-nexus/sdk
- License: [MIT](./LICENSE)

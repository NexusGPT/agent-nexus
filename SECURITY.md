# Security Policy

## Supported versions

We support the latest published version of each package on npm. Always upgrade to the latest minor/patch before reporting an issue.

## Reporting a vulnerability

**Do not open a public GitHub issue.** Use GitHub's private vulnerability reporting:

[Report a vulnerability](https://github.com/NexusGPT/agent-nexus/security/advisories/new)

Include:

- Affected package (`@agent-nexus/cli` or `@agent-nexus/sdk`) and version(s)
- A short description of the vulnerability and its impact
- Reproduction steps or a minimal proof-of-concept
- Your suggested mitigation, if any

We aim to acknowledge new reports within **2 business days** and to have a fix or mitigation plan within **7 business days** for high-severity issues.

## Provenance + supply chain

Every published release of `@agent-nexus/cli` and `@agent-nexus/sdk` carries a signed npm provenance attestation linking the published tarball back to the GitHub Actions workflow run that built it. Verify with:

```bash
npm audit signatures @agent-nexus/cli
npm audit signatures @agent-nexus/sdk
```

If the attestation does not verify or links to a build you cannot identify, please report it via the same private vulnerability process.

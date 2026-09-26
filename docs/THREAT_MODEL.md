# Threat model, v0.1

## Intended use

A developer runs Approval Doctor against a local MCP client JSON config to see declared or inferred capabilities, approval claims, and missing evidence before granting an agent tool access.

## Trust boundaries

- The config is untrusted input. Parsing reads JSON only and never executes commands, contacts a URL, expands environment variables, or loads a server.
- Tool names can mislead. Their effects are `INFERRED`; an apparently read-only tool may mutate data.
- `requiresApproval: true` is `DECLARED`, not `ENFORCED`. Client configuration does not verify middleware, user interaction, or policy behavior.
- Scope arrays are declarations. Paths can contain sensitive names; users should inspect reports before sharing them. Environment variable **values** and command arguments are excluded from output. Credential names may also reveal integrations.
- A missing tools list means actual capabilities are unknown. Even a listed tool inventory is only partial evidence because a live server can differ.

## Out of scope

This milestone does not validate MCP protocol handshakes, server binaries, delegated credentials, sandbox boundaries, approval bypasses, network egress, or runtime traces. It does not enforce permissions. Reports are review aids, not safety guarantees. Avoid running it on files whose paths themselves are confidential if sharing a report; SARIF includes the input path.

## Validation direction

Next steps require independently verified live inventory, observed effects, and enforcement checks with distinct evidence sources. Preserve provenance instead of upgrading inferred claims to enforced ones by assumption.

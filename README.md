# Coldgate

Coldgate is a Frosted Logic project for making an AI agent's authority legible. Its first milestone is a shared authority model and **Approval Doctor**, a deterministic local CLI for inspecting MCP client configuration declarations.

This release never starts an MCP server, invokes a tool, probes credentials, or sends telemetry. A configuration file cannot prove what tools a server actually exposes or whether a declared approval rule is enforced. The report explicitly marks those gaps as `UNKNOWN`.

## Requirements and quick start

Node.js 22.18+ (24 recommended); no install step or external runtime dependencies are required.

```sh
node packages/approval-doctor/bin/approval-doctor.js scan fixtures/mcp-basic.json
node packages/approval-doctor/bin/approval-doctor.js scan fixtures/mcp-basic.json --format json
node packages/approval-doctor/bin/approval-doctor.js scan fixtures/mcp-basic.json --format sarif --fail-on warning
npm test
```

The `--fail-on warning` gate returns 1 on warnings; parse/read errors return 2. The default text and JSON reports return 0 with findings. Never treat a zero exit status as a security certification.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/authority/src` | Versioned authority record types and static parser |
| `packages/approval-doctor` | CLI and text, JSON, SARIF output |
| `fixtures` | Synthetic configuration with expected uncertainty and findings |
| `tests` | Evidence, privacy, parser and CLI behavior checks |
| `docs/THREAT_MODEL.md` | Trust boundaries and known blind spots |

The v0.1 authority record captures principal, agent, provider/operation/effect, resource paths and hosts, credential **names**, scopes, approval, delegation, and inventory. Each claim carries an evidence status: `DECLARED`, `INFERRED`, `OBSERVED`, `ENFORCED`, or `UNKNOWN`. This scanner produces only declared, inferred, and unknown claims. A tool name provides a conservative effect hint; it cannot verify implementation behavior. Tool listings included in config are marked `partial` because runtime discovery may differ.

Supported input is JSON containing `mcpServers` or `servers` objects. `tools` may be an object or an array of named descriptors. `requiresApproval` / `approval`, `allowedPaths` / `paths`, `allowedHosts` / `hosts`, and `scopes` are treated as declarations only. Unrecognized schemas, transport permissions and runtime behavior are outside v0.1.

Future tools can reuse the authority record. AuthorityDiff, Capability Manifest, TraceCap and PolicyReplay are planned concepts, not implemented here.

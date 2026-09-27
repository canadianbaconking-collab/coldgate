# Pinned public corpus

This corpus measures static effect detection, separately from correctness tests. Definitions are short excerpts of original tool name, description, and supported annotation metadata. Some long descriptions were truncated at a complete sentence, so the benchmark tests the retained excerpt rather than every word of the upstream tool. Each JSON file names a pinned upstream commit, license, original definition path, and independent handler path. The `expectedEffects` and `labelNote` fields were manually labeled from the handler, not inferred from the description or annotation.

The sample is intentionally small and skewed toward common operations. It is not a representative accuracy estimate, and it was reviewed from source rather than executed against live services. Exact tool behavior may depend on arguments, credentials, server configuration, and code after the pinned commit. Cloud remains unscored until separately sourced.

Run `npm run benchmark` for measured quality. It reads checked-in JSON, invokes `scanConfig` only, and contacts no server. No ordinary `npm test` assertion requires a particular accuracy score; changes in detection quality must be reviewed against these metrics and source labels. Attribution and permission: GitHub MCP Server and archived MCP reference servers are MIT, Playwright is Apache-2.0, and the active MCP filesystem repository has a transitional MIT/Apache-2.0 LICENSE at the recorded commit. Retain attribution when redistributing the excerpts.

## Pinned source and handler references

| Category | Upstream definition at pinned commit | Independent behavior source |
| --- | --- | --- |
| GitHub | [GitHub MCP README](https://github.com/github/github-mcp-server/blob/85598ba6e1256f7ebf4867b95d63b833c4549264/README.md) | [Issues](https://github.com/github/github-mcp-server/blob/85598ba6e1256f7ebf4867b95d63b833c4549264/pkg/github/issues.go), [repositories](https://github.com/github/github-mcp-server/blob/85598ba6e1256f7ebf4867b95d63b833c4549264/pkg/github/repositories.go), [search](https://github.com/github/github-mcp-server/blob/85598ba6e1256f7ebf4867b95d63b833c4549264/pkg/github/search.go) |
| Filesystem | [Tool registration](https://github.com/modelcontextprotocol/servers/blob/f46d9578190b476b3501923ea8977d899e8db2cb/src/filesystem/index.ts) | [Handlers](https://github.com/modelcontextprotocol/servers/blob/f46d9578190b476b3501923ea8977d899e8db2cb/src/filesystem/lib.ts) |
| Slack | [Tool registration](https://github.com/modelcontextprotocol/servers-archived/blob/9be4674d1ddf8c469e6461a27a337eeb65f76c2e/src/slack/index.ts) | Same file's call-tool handler |
| SQLite | [Tool registration](https://github.com/modelcontextprotocol/servers-archived/blob/9be4674d1ddf8c469e6461a27a337eeb65f76c2e/src/sqlite/src/mcp_server_sqlite/server.py) | Same file's `handle_call_tool` branch |
| Browser | [Evaluate](https://github.com/microsoft/playwright/blob/b9a34ac7783a1b6c2e1dfff0c08ac744c048fa59/packages/playwright-core/src/tools/backend/evaluate.ts), [navigate](https://github.com/microsoft/playwright/blob/b9a34ac7783a1b6c2e1dfff0c08ac744c048fa59/packages/playwright-core/src/tools/backend/navigate.ts), [snapshot](https://github.com/microsoft/playwright/blob/b9a34ac7783a1b6c2e1dfff0c08ac744c048fa59/packages/playwright-core/src/tools/backend/snapshot.ts) | Same files' handlers |

Development definitions influenced the parser. Holdout files were selected afterward and are not tuned to this release. Zero labeled real contradictions means no real-world contradiction rate can be reported; synthetic regression coverage is separate.

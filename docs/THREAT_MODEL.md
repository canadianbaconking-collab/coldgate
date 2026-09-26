# Threat model and limits

## Trust boundaries

The target project is untrusted input. Approval Doctor reads only selected local JSON files, limits each file to 2 MB, rejects explicit symlink inputs, and does not load JS, import a package, start an MCP server, contact a URL, resolve environment variables, or invoke a tool. JSON parsing cannot execute a configuration command. Directory discovery checks a fixed list of paths.

Reports omit raw configuration, command arguments, remote URLs, environment values, and input schemas. Credential **identifiers**, tool names, and declared resource paths can still expose information; inspect reports before sharing them. Input filenames appear in SARIF but full source paths do not. JSON is not a substitute for an output data classification policy.

## What static evidence cannot establish

- Whether the server's live `tools/list` matches a saved snapshot, or whether a client exposes all of them to an agent.
- Whether any tool implementation is read-only, destructive, idempotent, bounded, or honest about its annotation hints.
- Whether declared allowed paths, domains, repository patterns, or SDK approval settings are actually enforced at the call site.
- Whether `onApproval` decides automatically, whether a human sees a request, or whether an inherited/conditional rule matches a specific call.
- Effective credential privileges, subagent delegation, parameter-sensitive effects, shell sandboxing, data exfiltration paths, and persistent tasks.

A warning means the evidence warrants inspection; its absence does not establish safety. Name heuristics may miss a side effect or create a false alarm. Unsupported configuration should be reported as unsupported rather than silently guessed. Future validation needs live inventory and independent enforcement evidence without promoting declarations automatically.

## Input validation limits

Structural validation is limited to fields used by the analyzer. It does not validate full JSON Schema semantics or all MCP protocol requirements. Unknown extension properties are ignored. Malformed recognized fields fail the document, and SARIF exposes the failure. Limits on input size and container counts reduce accidental resource exhaustion; they are not an operating-system resource sandbox. Duplicate literal JSON object keys are handled by JSON.parse (last value wins) and are not detected in this version.

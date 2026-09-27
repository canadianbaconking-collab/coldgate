# Threat model and limits

## Trust boundaries

The target project is untrusted input. Coldgate Scan reads only selected local JSON files, limits each file to 2 MB, rejects explicit symlink inputs, and does not load JS, import a package, start an MCP server, contact a URL, resolve environment variables, or invoke a tool. JSON parsing cannot execute a configuration command. Directory discovery checks a fixed list of paths.

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

## Connected config references

Connection manifests may reference only relative files below their own directory, using forward slashes with no dot/parent components. Referenced symlink components and nonregular files are rejected. Reads are bounded to 2 MB even if a file grows, and use no-follow/nonblocking flags where available. These checks are not an OS sandbox against another process concurrently replacing directories. Use a stable checkout for analysis.

The connection manifest is a user-supplied association, not proof of server identity. Catalog fingerprints do not prove freshness or authenticity. Omitted pagination metadata cannot be detected; callers must supply the complete saved catalog. A saved tool definition cannot supply authoritative client approvals, credentials, or resource restrictions. Connected mode ignores those catalog fields when building capabilities. Example data is synthetic; no server or account was queried to generate it.

## Snapshot comparison

Coldgate Diff consumes untrusted JSON reports under 8 MB each. It checks required claims, supported schema versions, duplicate identities, and failed-analysis markers before comparing. Error messages never echo the report's raw error strings. Displayed identifiers and scope strings are sanitized; Markdown escapes HTML and mentions. Snapshot authors can forge any claim, including OBSERVED or ENFORCED. The differ reports those assertions without validating their truth.

Parameter schema values are not emitted. Their fingerprint is not encryption: someone who knows all but a small secret can test guesses against a hash. Do not embed real secrets in schemas or commit sensitive reports. Source paths, property names, credential identifiers and resource names can still be sensitive.

Input schema processing is bounded to depth 64 and 10,000 visited elements. General JSON Schema implication is out of scope. An unchanged diff means no supported represented claim changed, not that authority is unchanged at runtime. A missing record does not prove revocation. The CI Action must run from a trusted pinned revision; evaluating untrusted snapshots does not require executing the code in their PR.

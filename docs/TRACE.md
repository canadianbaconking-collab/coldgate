# Coldgate Trace — 0.4.0

Coldgate Trace turns saved telemetry into a chronological capability review. It imports files, not running agents. It does not collect traces, contact providers, replay calls, or enforce policy.

## Run it

From the checkout in PowerShell:

```powershell
cd C:\dev\playground\coldgate
npm install --ignore-scripts
npm exec -- coldgate trace examples/trace/openai.json
npm exec -- coldgate trace examples/trace/otlp.json --format json
npm exec -- coldgate trace examples/trace/otlp.json --format markdown
npm exec -- coldgate trace examples/trace/otlp.json --format html --output trace-review.html
Start-Process .\trace-review.html
npm exec -- coldgate trace examples/trace/otlp.json --fail-on reported-error
# Last command exits 1: the synthetic HTTP span reports an error.
```

`--output` exclusively creates a new file with owner-only permissions where supported. It refuses existing paths, including symlinks. Choose another filename for subsequent reviews. Without `--output`, output goes to stdout. HTML is a standalone file with expandable evidence rows, no JavaScript, no remote assets, and a restrictive Content Security Policy.

Exit codes: **0** analyzed successfully (not a safety certificate); **1** at least one supported capability event reports an error when `--fail-on reported-error` is selected; **2** malformed/unsupported input, invalid arguments, or file failure. The error gate is an operational trace check, not an approval-policy evaluator. Errors on omitted model/agent spans are outside this gate.

## Supported import contracts

| Input | Recognized events | Important limits |
|---|---|---|
| OpenAI Agents **Python** SDK `Span.export()` objects, in a JSON array or `{ "spans": [...] }` | `span_data.type: "function"`; explicit custom `coldgate.approval` records | This is a local collection of exported span objects, not a promise of compatibility with dashboard downloads, Responses objects, JavaScript SDK exports, or arbitrary tracing platforms. |
| OTLP/JSON `resourceSpans[].scopeSpans[].spans[]` | Tool calls identified by `gen_ai.operation.name=execute_tool` or `mcp.method.name=tools/call`; `mcp.method.name=resources/read`; HTTP CLIENT spans (`kind: 3`) with `http.request.method` | JSON only, not protobuf, NDJSON, compressed archives, old `instrumentationLibrarySpans`, or OTel console-exporter JSON. Recognized attributes must use `value.stringValue`. |

The examples are synthetic and contain deliberate secret sentinels to verify omission; they are not real account traces. Use your existing trusted exporter to save data locally. Coldgate does not install or configure a tracing SDK.

OpenAI imports require `object: "trace.span"`, `id`, `trace_id`, and `span_data.type`; function records need `span_data.name`. `parent_id`, `started_at`, and `ended_at` may be missing/null. ISO timestamps need explicit timezone information; fractions up to nine digits are preserved. `error: null` on an ended span means **ENDED_WITHOUT_REPORTED_ERROR**, not proven success. An absent error field produces UNKNOWN. An error object produces REPORTED_ERROR; its contents are omitted.

OTLP trace/span IDs must be valid nonzero 32/16-character hexadecimal strings. Parent IDs are matched within the same trace. `startTimeUnixNano` and `endTimeUnixNano` accept uint64 decimal strings or safe integer numbers; strings are necessary for normal modern nanosecond timestamps. Zero/missing timestamps mean unknown. Status `code: 1` means REPORTED_OK, `2` means REPORTED_ERROR, and absent/`0` means UNKNOWN. Missing end time produces INCOMPLETE unless an error is explicitly reported. No outcome establishes that an external side effect happened or was rolled back.

## Evidence and privacy

The shared `Claim<T>` model distinguishes **OBSERVED** telemetry assertions, **INFERRED** name-based effects, and **UNKNOWN** missing evidence. OBSERVED means the supplied log reports it; Coldgate cannot authenticate the log. No trace field is promoted to ENFORCED. Tool names alone do not prove effects, and finished spans do not prove approval, success, resource access, or destination contact.

HTTP client spans infer an `EXTERNAL_COMMUNICATION` capability attempt; `resources/read` infers `READ`. These are method-based hypotheses, not confirmed side effects.

Only bounded identities, timestamps, selected labels, status codes, and supported evidence enter the normalized report. Tool arguments, results, prompts, model outputs, error messages, arbitrary attributes, and raw MCP resource URIs are omitted. URLs retain only the host/port; credentials, path, query, and fragment are discarded. A host on a tool span identifies a recorded endpoint, not every downstream destination. HTTP child spans retain their parent IDs; Coldgate does not invent a causal link when a parent is absent.

Retained labels, IDs, hostnames, and explicit resource labels can still contain sensitive data. The sanitization of common credential assignments is a display safeguard, not a universal secret detector or anonymization guarantee. Review reports before sharing. No raw-input hash is stored.

## Explicit Coldgate metadata extensions

These are **Coldgate conventions**, not native approval controls or standardized OTel approval attributes. They are optional, per-span assertions supplied by trusted instrumentation. Coldgate neither writes them into a running system nor validates their authenticity.

| OTLP attribute | Interpretation |
|---|---|
| `coldgate.provider` | Tool/provider label. Never inferred from the LLM provider or service name. |
| `coldgate.resource` | Caller-sanitized resource label. Raw tool arguments and resource URIs are never mined for this. |
| `coldgate.approval` | Exact `REQUESTED`, `APPROVED`, or `DENIED` recorded for this span. Missing is UNKNOWN. |
| `server.address` or fallback `url.full` | Recorded destination, reduced to a host/port. Does not establish contact or downstream access. |

For OpenAI Python exports, an optional custom span with `span_data.type: "custom"`, `span_data.name: "coldgate.approval"`, and `span_data.data: { "decision": "DENIED", "tool_name": "send_email", "provider": "mailer" }` creates a separate approval event. It is **not** automatically applied to a nearby or similarly named function span. The synthetic example demonstrates why correlation by name/time would manufacture approval coverage.

## Completeness, limits, and reuse

Up to 8 MB per file; 10,000 spans total; 1,000 resource/scope groups per respective array; 1,000 attributes per span; 128-character IDs and 512-character display labels. Inputs must be regular files, with explicit symlinks rejected. Duplicate `(traceId, spanId)` pairs, duplicate attribute keys, malformed recognized fields, reversed timestamps, and parent cycles invalidate the whole report. There are no partial results on failure.

Missing parents, missing start times, and reported dropped span data produce caveats. Unsupported and non-capability span types are counted as omitted. A report with zero supported events explicitly says that this does not prove zero tool use. Sampling, export loss, and omitted attributes mean no trace can establish complete authority coverage. Sorting uses exact nanoseconds, with missing starts last; timestamps across traces are not causal proof. Human timestamps display milliseconds; exact values remain in event details and JSON.

Import `normalizeTrace(input)` from `@coldgate/trace`. It returns a `kind: "coldgate-trace"`, schema-0.1 report with events, counts, warnings, and errors. The API expects already-parsed JSON; byte limits are enforced at the CLI file boundary. Trace events reuse the authority package's claim/effect types but remain separate from static inventory reports. `coldgate diff` does not accept trace reports. A future offline policy-replay milestone can consume these events without silently upgrading inference to enforcement.

## Adapter references

Mappings checked September 27, 2026 against primary sources:

- [OpenAI Python span export implementation](https://github.com/openai/openai-agents-python/blob/main/src/agents/tracing/spans.py)
- [OpenAI Python span data](https://github.com/openai/openai-agents-python/blob/main/src/agents/tracing/span_data.py)
- [OTLP JSON encoding](https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding)
- [OpenTelemetry GenAI tool spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md)

GenAI conventions evolve. Unsupported formats need an explicit adapter and fixtures, not heuristic field guessing.

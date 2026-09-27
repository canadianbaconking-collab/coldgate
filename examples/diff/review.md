## Coldgate — AuthorityDiff

- EFFECTS\_CHANGED repository\.create\_issue
  Before: \["WRITE"\]
  After: \["DESTRUCTIVE","WRITE"\]
  Declared or inferred effect classes changed\. Actual implementation behavior is unverified\.

- APPROVAL\_CHANGED repository\.create\_issue
  Before: REQUIRED \[DECLARED\]
  After: NOT\_REQUIRED \[DECLARED\]
  The explicit requirement changed; review whether consequential calls still need approval\.

- BOUNDARIES\_CHANGED repository\.create\_issue
  Before: \["repository\_pattern:frostedlogic/coldgate"\]
  After: \["repository\_pattern:\*"\]
  A new wildcard boundary is declared; potential scope expansion needs review\.

- CREDENTIALS\_CHANGED repository\.create\_issue
  Before: \["READ\_TOKEN"\]
  After: \["READ\_TOKEN","WRITE\_TOKEN"\]
  Credential identifiers changed; values and effective privileges are not compared\.

- PARAMETERS\_CHANGED repository\.create\_issue
  Before: 20271bffc7990e2e99d4939336fe14a34c8c1ff9673fec15d548d2ead5eb94be
  After: e0746f19d152448f58cb39f252f8edf26ca0aa3a60da752774a4ebd58f8d6a8b
  A top\-level enum/const restriction is no longer represented\. Review possible parameter widening; other constraints may still apply\.

- ANNOTATIONS\_CHANGED repository\.create\_issue
  Before: \[\["destructiveHint",false\],\["readOnlyHint",false\]\]
  After: \[\["destructiveHint",true\],\["readOnlyHint",false\]\]
  MCP descriptive hints changed; these are not enforcement guarantees\.

- EFFECT\_EVIDENCE\_CHANGED repository\.create\_issue
  Before: \["WRITE:DECLARED:mcpServers\.repository\.tools\.create\_issue\.annotations"\]
  After: \["DESTRUCTIVE:DECLARED:mcpServers\.repository\.tools\.create\_issue\.annotations","WRITE:DECLARED:mcpServers\.repository\.tools\.create\_issue\.annotations"\]
  Per\-effect evidence changed; the aggregate effect set alone may hide this difference\.

- BOUNDARY\_EVIDENCE\_CHANGED repository\.create\_issue
  Before: \["repository\_pattern:frostedlogic/coldgate:DECLARED:mcpServers\.repository\.tools\.create\_issue\.repositories"\]
  After: \["repository\_pattern:\*:DECLARED:mcpServers\.repository\.tools\.create\_issue\.repositories"\]
  Boundary evidence changed independently of whether the boundary is enforced\.

- TOOL\_ADDED repository\.send\_email
  Before: absent
  After: snapshot \[DECLARED\]
  New snapshot entry; this does not establish when runtime authority was acquired\.

9 represented changes.
Snapshot changes do not prove runtime authority changes or enforcement.

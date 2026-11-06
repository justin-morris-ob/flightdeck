# Evaluation and allocation specification

This is the targeting contract for the unified replacement, including the consumer-context extension. [Unified verification](stage-two-verification.md#unified-redesign-verification) records integrated local checks and browser/SDK evidence; older sections retain historical executions. The permanent scalar/allocation corpus is `shared/evaluation-vectors.json`; its historical hash expectations were independently calculated using Python `hashlib.sha256`. List-membership and HTTP/provider boundaries have additional behavioral tests. Assignment is not exposure, authorization, a measured experiment or an experiment result.

## Inputs and precedence

`evaluate({flag, context, overrides, now})` is deterministic with an explicit ISO timestamp. It reads no clock, database or mutable global state. A null flag throws `UnknownFlagError` with code `unknown_flag`; unknown is not an ordinary false result.

The first applicable decision wins:

1. Archived flag: configured off value, `enabled:false`, reason `archived`.
2. Disabled environment: configured off value, `enabled:false`, reason `disabled`.
3. Exact active override, matching flag, project, environment, tenant and subject.
4. First eligible ordered rule.
5. Configured default outcome.

An active override has no revocation timestamp and `now < expiresAt`. Equality at the expiry instant is expired. Timestamps compare instants, not textual representation. An override selects a typed value or a fixed variant, never weighted allocation. Owner and reason are management metadata, not matching predicates.

For every non-gated result `enabled:true` describes the environment gate, including a false boolean value or a missing-subject off value. Decisions include flag revision, catalog revision at flag publication, optional selected variant and matched rule/override IDs. Current segment versions are separate from that publication-time catalog revision. Trace entries contain codes, logical IDs, attribute names and allocation buckets only; they do not contain raw context values or tenant/subject identifiers.

## Conditions, segments and rules

Each rule ANDs all its conditions and attached segment references. A segment matches ANY definition block; every condition inside a block must match (AND). People and membership selections form alternative branches, with source/tenant guards retained inside each branch. Empty rule predicates match. Flag snapshots retain validated attribute definitions, while attached segments follow the current published definition in the same project/environment. A saved segment draft is never used for published evaluation.

Each resolved segment carries its own published `contextDefinitions`; direct flag conditions retain the attribute types validated at flag publication. The evaluator checks raw context independently against each definition, without merging incompatible types, coercing values or rejecting a valid migrated configuration with a type-conflict error. A later following-segment type change can make an AND combination unsatisfiable for a context, but cannot rewrite direct flag bindings or crash evaluation.

Saving/restoring a segment draft leaves live behavior unchanged. Explicit segment publication atomically changes all published local references without per-flag republishing, flag revision increments or changes to gates, direct selections and unrelated drafts. A disabled flag still follows the new definition, but the off gate wins evaluation. Historical published definitions are retained for inspection/restore as draft, not independently pinned by flags.

The built-in `tenantId` and `subjectId` attributes are strings read from the top-level context, not from `context.attributes`. They cannot be redeclared as custom definitions. Their presence, absence and negative-comparison behavior follows the same rules as declared custom attributes.

Presence means an own attribute property exists. A present attribute must have the declared scalar or `string_list` type. No coercion occurs. Missing attributes fail equality, membership, ordered comparisons and their negative forms. A present wrong-type attribute fails every operator, including presence and absence. `absent` succeeds only for a missing attribute; `present` succeeds only for a present correctly typed attribute. `not_eq` and `not_in` require a present correctly typed scalar and correctly typed operands; they are not missing-data fallbacks. Ordered comparisons require numeric values and operands. Scalar equality and membership use exact equality.

For a string trait, `ends_with` requires a present string and a string suffix and uses exact case-sensitive suffix matching. There is no case folding, whitespace normalization or scalar coercion. Missing/wrong-type traits fail the condition.

`string_list` is an array of at most 100 strings, each at most 500 characters. `contains_any` requires at least one exact shared string between the context list and its 1–20 string operands; `contains_all` requires every operand to occur in the context list. Case, whitespace and source-specific identifiers are not normalized. Empty lists are present, but cannot satisfy either nonempty membership predicate. Lists support `present` and `absent`; scalar operators on a list definition and list operators on a scalar definition are rejected during publication. A comma-separated string is not a list. The entire serialized UTF-8 context is bounded to 32 KiB and 32 custom attributes; the HTTP envelope is independently bounded to 64 KiB to accommodate context plus a proposed configuration during preview.

A zero rollout never admits anyone. A full 10000-basis-point rollout requires no subject for a fixed typed value. An intermediate rollout requires both tenant and subject; missing identity skips the rule and continues to the next rule/default, recording `missing_subject`. Admission is `bucket < rolloutBasisPoints`; equality excludes. A matched rule whose outcome requires a variant but lacks identity returns the off value with reason `missing_subject`, rather than falling through.

## OpenFeature server provider

`packages/openfeature-provider` is an independent compiled JavaScript/declaration package using `@openfeature/server-sdk` 1.23.0. A provider instance fixes endpoint, service credential, project and environment; context cannot expand that scope. It maps `targetingKey` to top-level `subjectId`, custom `tenantId` to top-level tenant, and other supported custom fields to `attributes`. Scalars and string lists are supported; nested structures, datetimes, ambiguous `subjectId`/`attributes` encodings and oversized contexts produce `INVALID_CONTEXT` details rather than being silently dropped. This is a documented provider context subset, not support for every OpenFeature context value or a certification claim.

The provider supports Boolean, string, number and JSON-object detail methods, validates response key/scope/type/revisions, prohibits redirects, and applies one finite deadline through response-body consumption. Responses are bounded to 256 KiB. It performs no directory lookup, caching, retry or exposure reporting. HTTPS is required except HTTP loopback for development.

OpenFeature's SDK returns the caller's default on evaluation errors. Consumers that require the Flightdeck policy must use a detail method and call `enforceFlightdeckPolicy(details)`: authorization and nonretryable context/request rejection throw sanitized errors. Unknown flags, unavailability, malformed responses and type mismatch retain explicitly marked SDK error/default details. Callers choose the fallback per feature; a default is never represented as a successful service decision. Metadata includes source, revisions, Flightdeck reason/error category and applicable HTTP status, but no credential or evaluation context.

## Versioned byte encoding

`allocationBucket(namespace, purpose, {tenantId, subjectId}, ruleId = '')` uses SHA-256 version `sha256-v1`. The exact ordered tuple is:

```text
['flightdeck', 'sha256-v1', purpose, namespace,
 purpose === 'rollout' ? ruleId : '', tenantId, subjectId]
```

For each string, encode UTF-8 bytes without Unicode normalization. Prefix those bytes with the ASCII decimal UTF-8 **byte** count and `:`. Concatenate all prefixed fields without any other delimiter. Empty string is `0:`. For example, the field `café` encodes as `5:café`, not `4:café`. Embedded colons are ordinary field bytes; `['a:b','c']` and `['a','b:c']` cannot collide through tuple ambiguity. Composed `é` and decomposed `e` plus combining acute accent are distinct inputs.

Compute SHA-256 over those bytes. Let `n` be the unsigned big-endian integer represented by the first four digest bytes. Then:

```text
bucket = floor(n * 10000 / 4294967296)
```

Buckets range from 0 through 9999 inclusive. Multiplication fits exactly in JavaScript's integer precision. Cross-language implementations must not interpret the digest prefix as a signed integer, use a modulo bucket, count Unicode characters instead of bytes, or normalize Unicode.

Rollout hashes include immutable rule ID. Variant hashes always encode an empty rule-ID field. Distinct purpose fields separate admission from variant assignment. Raising a rollout threshold leaves every subject bucket unchanged and preserves earlier eligibility. Display names do not occur in the tuple. Immutable allocation namespace and stable rule/variant IDs are operational requirements; replacing them can change assignment.

## Variant intervals

All variant weights are integer basis points totaling exactly 10000; zero weight is permitted. Iterate in declared array order, accumulating weights. A variant owns `[previous cumulative weight, new cumulative weight)`. For weights `[0,5000,5000]`, intervals are empty, `[0,5000)`, `[5000,10000)`. Thus buckets 0 and 4999 select the second variant; 5000 and 9999 select the third. No weight is automatically redistributed.

A weighted outcome uses the independent variant-purpose bucket. A fixed variant selects its logical ID directly. Both require tenant and subject; if either is absent they return the configured off value and `missing_subject`. A fixed typed value does not require identity. All configured outcomes and variant values share the off value's declared type. Invalid variant references, type mismatches and weight totals must be rejected before publication.

Changing rule admission does not change a subject's variant hash. Reordering variants, changing IDs or weights can change intervals and assignments. `configurationWarnings(current, proposed)` reports assignment-sensitive rule/default changes, variant IDs/order/weights and changed validated definition snapshots. Segment publication has its own before/after and affected-reference review, distinct from flag configuration review. Display-name-only rule or variant edits are not allocation changes. Preview warnings are risk explanations, not measured treatment effects.

## Portable corpus

The JSON corpus includes explicit flag/configuration, context, overrides, fixed time and expected decision fields or error code. Hash vectors additionally carry the encoded byte hex, full digest and expected bucket for independent implementers. Coverage includes UTF-8 and delimiter boundaries, composed/decomposed Unicode, distinct hash purposes, exact admission thresholds, interval buckets 0/4999/5000/9999, zero weights, first-match ordering, AND segments, negative/presence operators with missing/wrong-type data, typed numeric boundaries, exact override scope and expiry, missing subject, gates and unknown flags. Permanent tests also assert monotonic admission, display-name stability and publication validation. Actual execution evidence belongs in the Stage 2 verification record after integration checks.

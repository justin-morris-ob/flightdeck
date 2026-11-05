# Evaluation and allocation specification

This is the Stage 2 implementation contract. The permanent cases are in `shared/evaluation-vectors.json`; their hash expectations were independently calculated using Python `hashlib.sha256`, not copied from evaluator output. [Stage 2 verification](stage-two-verification.md) records executed tests and runtime/browser scenarios. Assignment is not an exposure, an authorization grant, a measured experiment or an experiment result.

## Inputs and precedence

`evaluate({flag, context, overrides, now})` is deterministic with an explicit ISO timestamp. It reads no clock, database or mutable global state. A null flag throws `UnknownFlagError` with code `unknown_flag`; unknown is not an ordinary false result.

The first applicable decision wins:

1. Archived flag: configured off value, `enabled:false`, reason `archived`.
2. Disabled environment: configured off value, `enabled:false`, reason `disabled`.
3. Exact active override, matching flag, project, environment, tenant and subject.
4. First eligible ordered rule.
5. Configured default outcome.

An active override has no revocation timestamp and `now < expiresAt`. Equality at the expiry instant is expired. Timestamps compare instants, not textual representation. An override selects a typed value or a fixed variant, never weighted allocation. Owner and reason are management metadata, not matching predicates.

For every non-gated result `enabled:true` describes the environment gate, including a false boolean value or a missing-subject off value. Decisions include flag revision, pinned catalog revision, optional selected variant and matched rule/override IDs. Trace entries contain codes, logical IDs, attribute names and allocation buckets only; they do not contain raw context values or tenant/subject identifiers.

## Conditions, segments and rules

Each rule ANDs all its conditions and all attached pinned segment predicates. Each segment ANDs all its conditions. Empty rule predicates match. Rules use published attribute definitions and segment snapshots, not live project catalog state. Catalog edits alone cannot change a published decision.

The built-in `tenantId` and `subjectId` attributes are strings read from the top-level context, not from `context.attributes`. They cannot be redeclared as custom definitions. Their presence, absence and negative-comparison behavior follows the same rules as declared custom attributes.

Presence means an own attribute property exists. A present attribute must have the declared scalar type. No coercion occurs. Missing attributes fail equality, membership, ordered comparisons and their negative forms. A present wrong-type attribute fails every operator, including presence and absence. `absent` succeeds only for a missing attribute; `present` succeeds only for a present correctly typed attribute. `not_eq` and `not_in` require a present correctly typed attribute and correctly typed operands; they are not missing-data fallbacks. Ordered comparisons require numeric values and operands. Equality and membership use exact scalar equality.

A zero rollout never admits anyone. A full 10000-basis-point rollout requires no subject for a fixed typed value. An intermediate rollout requires both tenant and subject; missing identity skips the rule and continues to the next rule/default, recording `missing_subject`. Admission is `bucket < rolloutBasisPoints`; equality excludes. A matched rule whose outcome requires a variant but lacks identity returns the off value with reason `missing_subject`, rather than falling through.

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

Changing rule admission does not change a subject's variant hash. Reordering variants, changing IDs or weights can change intervals and assignments. `configurationWarnings(current, proposed)` reports assignment-sensitive rule/default changes, variant IDs/order/weights, and refreshed catalog/segment snapshots. Display-name-only rule or variant edits are not allocation changes. Preview warnings are risk explanations, not evidence of measured treatment effects.

## Portable corpus

The JSON corpus includes explicit flag/configuration, context, overrides, fixed time and expected decision fields or error code. Hash vectors additionally carry the encoded byte hex, full digest and expected bucket for independent implementers. Coverage includes UTF-8 and delimiter boundaries, composed/decomposed Unicode, distinct hash purposes, exact admission thresholds, interval buckets 0/4999/5000/9999, zero weights, first-match ordering, AND segments, negative/presence operators with missing/wrong-type data, typed numeric boundaries, exact override scope and expiry, missing subject, gates and unknown flags. Permanent tests also assert monotonic admission, display-name stability and publication validation. Actual execution evidence belongs in the Stage 2 verification record after integration checks.

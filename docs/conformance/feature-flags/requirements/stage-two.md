# Stage 2 observable requirements

Stage 1's lifecycle, authorization, audit, concurrency and independent Atlas composition requirements remain applicable. This document supersedes Stage 1 §3.1–§3.2's boolean-only evaluation semantics: gates return the configured typed off value, not universally false. The preproduction GET evaluation contract is removed, not retained as an alias.

## §1 Typed publication and pinning

- **§1.1** Each environment configuration declares a boolean, string, number or JSON off value. Every fixed outcome and variant payload must have that same type. Invalid values, weights, references or oversized inputs fail before any revision/audit write.
- **§1.2** Rules have stable IDs and explicit array order. Each rule ANDs its conditions and referenced segment predicates. The first eligible rule selects the outcome; otherwise the configured default applies.
- **§1.3** Project catalogs define typed scalar attributes and reusable segments. Catalog mutations require the expected catalog revision and append actor-attributed history atomically. Catalogs cannot reference another project's resources.
- **§1.4** Publication pins attribute definitions and referenced segment snapshots. Catalog changes alone never alter live evaluations. Refreshing those snapshots requires explicit review/publication with the current expected catalog and flag revisions.
- **§1.5** Changing one environment's type/configuration does not mutate another environment. Existing flag IDs, enabled/archive state and revisions survive migration.

## §2 Evaluation and assignment

- **§2.1** Precedence is archived, environment disabled, active exact override, first eligible ordered rule, configured default. `enabled` denotes the master environment gate, independently of the returned typed value.
- **§2.2** Custom conditions use published types with no coercion. Missing/wrong-type attributes do not satisfy negative comparisons. Presence/absence is explicit; a wrong type satisfies neither. Built-in tenant/subject predicates read top-level context.
- **§2.3** Allocation follows the exact versioned byte/hash specification in [evaluation-spec.md](../../../evaluation-spec.md). Immutable namespaces and stable IDs determine buckets; display names do not. Raising a rollout threshold preserves existing eligibility for unchanged inputs.
- **§2.4** Zero rollout never admits; full rollout with a fixed value needs no subject. Partial rollout and every variant outcome require both tenant and stable subject. Missing identity is explained, not assigned randomly.
- **§2.5** Variant weights are integer basis points totaling 10000, using ordered half-open intervals and a separate hash purpose from admission. No automatic weight redistribution occurs. Reassignment-sensitive changes produce warnings and a same-context current/draft preview.
- **§2.6** Unknown flags are errors. Decisions include tagged value, scope/key, gate, reason, flag/catalog revisions, selected variant and matched rule/override IDs. Trace excludes raw subject/context values. Preview and consumer evaluation use the same evaluator; preview does not publish.
- **§2.7** Language-neutral permanent cases cover precedence, exact boundaries, missing/wrong-type conditions, negative operators, expiry, unknown/archive gates and hash encoding. Evaluations are not stored as exposure events or results.

## §3 Scope and overrides

- **§3.1** Service evaluation requires an authorized project/environment and a tenant in the credential's explicit grant before flag lookup. Credentials grant 1–20 tenants; migration restricts existing local credentials to `local-tenant`. Granting a tenant is not proof of BC membership.
- **§3.2** Overrides match exact flag/project/environment/tenant/subject, require owner/reason/future expiry, and select a typed value or fixed variant. They cannot override archive/disable. At the expiry instant they are expired. Revocation and audit are atomic; runtime cannot arbitrarily rewrite an override.
- **§3.3** Publishing must reject incompatibility with active overrides. Cross-organization/project/environment operations cannot read or mutate another scope. Viewers cannot write; editors cannot issue credentials.
- **§3.4** The backend client POSTs context, validates decision scope/key/tagged type and distinguishes a declared typed fallback from a service decision. Authorization failure throws, never silently falls back. Secrets stay out of browser bundles/storage.

## §4 Actual operator surface

- **§4.1** Shared standalone/Atlas pages provide structured typed values, catalog/segment editing, ordered rules, variants, scoped override create/revoke and audit. They use Onebrief components/tokens, not copied reference-product UI.
- **§4.2** Preview shows exact current/proposed decisions and assignment warnings; publication requires explicit scoped review/confirmation. Invalid JSON/weights cannot appear successfully published.
- **§4.3** Viewers have read-only authoring controls and can simulate published context. Embedded pages defer chrome/theme ownership to Atlas. Both themes render actual targeting/playground content without overlapping toolkit blocks.
- **§4.4** Switching between Configuration, Activity and Subject overrides without mutation preserves the unpublished draft, preview and simulation context. Merely inspecting history is not an implicit discard.

## Evidence

See [Stage 2 verification](../../../stage-two-verification.md). Automated behavior tests and actual HTTP/consumer/browser scenarios support distinct claims; a passing build alone proves none of the interactive or deployment behavior. Production identity, verified BC context, hosted deployment and measured experiments remain external/later-stage gates.

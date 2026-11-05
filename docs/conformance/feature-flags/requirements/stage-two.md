# Stage 2 and consumer-extension observable requirements

Stage 1's lifecycle, authorization, audit, concurrency and independent Atlas composition requirements remain applicable. This document supersedes Stage 1 §3.1–§3.2's boolean-only evaluation semantics: gates return the configured typed off value, not universally false. The preproduction GET evaluation contract is removed, not retained as an alias.

## §1 Typed publication and pinning

- **§1.1** Each environment configuration declares a boolean, string, number or JSON off value. Every fixed outcome and variant payload must have that same type. Invalid values, weights, references or oversized inputs fail before any revision/audit write.
- **§1.2** Rules have stable IDs and explicit array order. Each rule ANDs its conditions and referenced segment predicates. The first eligible rule selects the outcome; otherwise the configured default applies.
- **§1.3** Project catalogs define typed scalar/string-list attributes and reusable segments. Catalog mutations require the expected catalog revision and append actor-attributed history atomically. Catalogs cannot reference another project's resources.
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
- **§4.4** Switching between Targeting, Activity and Exceptions (advanced) without mutation preserves the unpublished draft, preview and simulation context. Merely inspecting history is not an implicit discard.

## §5 Shared project inventory and environment scope

- **§5.1** A project owns one flag definition per immutable key, shared by all its environments. Creating from any environment initializes that same flag disabled in every project environment. Metadata and archive/restore remain project-wide; values, targeting, enabled state and overrides remain environment-specific.
- **§5.2** Inventory lists one row per project flag with per-environment gates. Choosing a different configuration environment does not change inventory membership or reset its search/page. An environment cell opens the exact flag/environment; a name opens the selected configuration environment.
- **§5.3** Project navigation is explicitly labeled Projects in standalone; embedded pages keep Atlas chrome and expose an explicit project selector. Project-wide targeting definitions are not presented as belonging to the selected environment.
- **§5.4** Archived lifecycle is distinct from saved gate state. An absent configuration is Unavailable, never silently Off. Status cells navigate rather than mutate; environment changes and project-wide archival require the existing scoped confirmations.
- **§5.5** The operator-only project inventory API returns lightweight summaries and stored environment gates from one SQL statement, bounded to 20 flags with stable cursors/search/archive filters. It excludes full configurations and other-project gates. Service credentials are denied; inaccessible projects return 404, invalid inputs 400. The obsolete environment GET list is removed and every repository caller is migrated.

## §6 Simple audience authoring with preserved advanced capabilities

- **§6.1** Compatible Boolean flags expose Everyone or Selected audiences. Everyone is explicit; an empty Selected audience matches nobody through audience rules and never implicitly becomes Everyone.
- **§6.2** Each selected Flightdeck segment is an OR alternative, implemented as one full-rollout true rule with false off/default values. Existing segment predicates keep AND semantics. The environment gate, archive state and active individual-override precedence remain unchanged.
- **§6.3** Simple edits preserve allocation namespace/hash version and retained rule IDs/names. Arbitrary conditions, partial rollouts, variants, typed outcomes, duplicate branches or other non-representable configurations are not automatically rewritten or converted.
- **§6.4** Working advanced authoring and simulation stay mounted behind a closed-by-default Advanced controls disclosure. Drafts/undo/context survive disclosure and detail-tab switches. Hidden invalid native configuration fields invalidate review and surface an error outside the disclosure; they cannot publish silently.
- **§6.5** Simple review uses the existing server validation/preview and publication routes, preserves version/catalog conflict checks and shows audience changes plus warnings. Empty-context configuration validation is explicitly not a BC-user simulation or membership-size estimate. Publication remains an explicit scoped confirmation; viewers cannot author or publish.
- **§6.6** BC people/email, organization and group pickers are genuinely disabled with disconnected status. This pass does not claim a directory connection, fake BC entities, directory service authentication or membership synchronization. Existing Flightdeck predicate segments remain usable, with missing/pinned selections preserved rather than silently dropped. Evaluation uses supplied context and has no BC directory dependency. The generic membership/provider extension below does not enable these directory controls.
- **§6.7** Metadata/version, advanced empty-context diagnostics and lifecycle actions do not obscure the default audience controls. Advanced functionality is not misleadingly labeled under development; only the unavailable BC connection is marked disconnected.

## §7 Consumer context, OpenFeature and reusable lab

- **§7.1** String-list attributes contain at most 100 strings of at most 500 characters each. Exact `contains_any` / `contains_all` use 1–20 string operands; missing/wrong-type lists never match, empty lists are present, and no scalar/string coercion occurs. Invalid operator/type pairs fail publication. Catalog editing and the advanced JSON-array playground use the same semantics.
- **§7.2** Serialized UTF-8 evaluation context is bounded to 32 KiB and 32 custom attributes. The 64-KiB HTTP envelope accommodates a maximum context and separately bounded proposed configuration. A maximum-sized context can be evaluated through the actual HTTP/provider/SDK boundary and previewed; an over-bound context fails instead of truncating.
- **§7.3** The independent server provider maps OpenFeature targetingKey to subjectId, tenantId to its top-level field and supported custom values to attributes. It fixes service credential/project/environment outside evaluation context, rejects unsupported/ambiguous context, validates response scope/key/type/revisions, prohibits redirects and bounds response consumption with one finite deadline.
- **§7.4** Actual typed SDK detail calls distinguish service decisions from caller defaults. `enforceFlightdeckPolicy` rejects authorization and nonretryable context/request errors even though the SDK normally returns defaults on errors. Recoverable errors retain explicit error/source metadata and the caller-selected default; no directory call, retry, cache or exposure is implied.
- **§7.5** The loopback-only consumer lab refuses production startup and accepts only known persona/capability/scenario IDs, never arbitrary browser context or credentials. Its backend owns the synthetic subject/source/tenant/membership mapping. Setup preserves existing configuration and stores its dedicated scoped credential privately. A selection change clears the old browser decision.
- **§7.6** The lab consumes real persisted Boolean/string/number/object decisions through the provider. Simulated unavailable/malformed transports are labeled as such; wrong-tenant/invalid-credential scenarios call Flightdeck and surface an explicit authorization error. It demonstrates context evaluation, not real BC identity or an authoring directory.

## Evidence

See [Stage 2 verification](../../../stage-two-verification.md). Automated behavior tests and actual HTTP/consumer/browser scenarios support distinct claims; a passing build alone proves none of the interactive or deployment behavior. Production identity, verified BC context, hosted deployment and measured experiments remain external/later-stage gates.

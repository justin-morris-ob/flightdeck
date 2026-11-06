# Flightdeck staged delivery plan

## Goal and working agreement

Build an independently owned Enablements and Experiments application: usable on its own, compatible with Atlas, and consumable by BC through a backend API. Model product coverage on Unleash and Flagsmith; express the UI through published Onebrief components and tokens. Apply BC's formatting conventions from day one.

The unified mockup is the approved behavioral replacement, not a cosmetic reskin. Its local/master scope and segment publication model supersede earlier project-wide metadata, local environment selection and pinned segment snapshots. Complete the replacement and record actual integrated evidence before claiming a new checkpoint.

Earlier Stages 0–2 and Stage 3 consumer/directory-authoring checkpoints have historical local evidence; production identity and operational gates remain open. The unified redesign now has [integrated local verification](stage-two-verification.md#unified-redesign-verification), without marking broader Stage 4 or later qualification complete. Historical checkpoints remain distinct from replacement-specific evidence.

## Stage map

| Stage                                       | Outcome                                                                                                             | Exit evidence                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 0 — Design and standards                    | Repository-owned architecture, scope, staged plan and BC-derived formatting                                         | Frozen install, formatter behavior smoke, repository formatting check                                     |
| 1 — First real vertical slice               | Standalone Onebrief UI authors a persisted boolean flag; a separate consumer evaluates it; same page loads in Atlas | Actual browser flow, real PostgreSQL persistence/restart, authorization failures and separate-shell smoke |
| 2 — Enablements and targeting               | Typed configuration, ordered rules, segments, scoped overrides, deterministic rollouts and variants                 | Evaluation vectors, real playground and boundary/precedence behavior                                      |
| 3 — BC consumption and delivery reliability | A real BC backend integration with explicit tenancy, safe fallback and scoped delivery                              | BC browser walkthrough plus outage, revocation and stale-data scenarios                                   |
| 4 — Operational management                  | Lifecycle, governance, production-change controls, usable audit and health signals                                  | Review/change/rollback workflow, concurrency and permission scenarios                                     |
| 5 — Measured experiments                    | Stable assignment, actual exposure, metrics and defensible analysis                                                 | Known event corpus reconciles through attribution and results; statistical review                         |
| 6 — Atlas environment deployment            | Approved artifact publication, migration execution, routing, identity and recovery                                  | Digest-pinned deployment, deployed browser/API proof, restore/rollback exercise                           |

Start deployment/identity onboarding during Stage 1; Stage 6 is qualification and execution, not the first conversation about prerequisites. Until its gates pass, earlier stages remain local or explicitly qualified development deployments.

## Unified redesign acceptance and verification plan

Use Flags / Segments / Audit trail as peer views and settings as secondary navigation. Local environment identity is fixed by server deployment configuration; master is read-only across actual reports, with configured links to local dashboards and no remote writes, requests or notifications.

- [x] Create an Off flag only in the configured local environment; review/save environment-local name, owner, description, archive state and Development/Release/System/Permissions lifecycle without changing other environments, gates or audiences.
- [x] Inspect published behavior, edit an audience in a local draft, review before/after and publish explicitly. Preserve advanced configurations instead of lossy conversion; test supplied context without directory lookup.
- [x] Create/save a segment draft with OR blocks and AND trait conditions, including `ends_with`, plus tenant/source-guarded people/membership alternatives. Effective memberships follow people across organizations.
- [x] Review and publish a segment; all published local references follow together, including Off flags, without flag revision changes, direct-selection changes or flag-draft publication. Verify both gate precedence and exclusion of draft-only references.
- [x] Retain immutable history; inspect old definitions and confirm guarded restore replaces only a draft. Review/publish separately before any restored contents become live.
- [x] Reject stale segment review after a draft or affected-reference change. Prove authorization, environment isolation and server-side write denial for viewer/master, including project-only endpoints.
- [x] Inspect scoped audit filters/pagination and exact publication impact; preserve event-time before/after without relabeling old pinned events as following.

Integrated local verification completed: preserved database migration, `pnpm check`, 353 tests, standalone/Atlas browser flows, master/viewer/environment boundaries and four recordings. The unified recording exercised author → draft → review → publish → actual SDK evaluation → history → restore → non-live draft. Checked criteria describe local acceptance only, not production certification. See [exact results and limitations](stage-two-verification.md#unified-redesign-verification); builds alone are not interactive proof, and production identity/deployment remain unqualified.

The Stage 0–3 sections below retain the earlier staged intent/checkpoints, including their former selectable-environment and catalog workflows; the unified requirements above take precedence wherever those differ. Historical checked boxes do not certify the replacement.

## Stage 0 — Design and standards

Deliver:

- This roadmap, [architecture decisions](architecture.md) and [BC formatting provenance](standards.md).
- Oxfmt `0.48.0`, a committed dependency lockfile, pinned Node/pnpm and real `fmt` / `fmt:check` commands.
- A formatting-only GitHub Actions workflow; no pretend application checks.
- Contributor instructions separating app ownership, Atlas composition and BC consumption.

Stage 0 established planning and standards only. Stage 1 below adds the runnable local service; production identity, BC tenant mapping, artifact intake and environmental resources remain explicit gates.

## Stage 1 — First real vertical slice

### Build

1. **Dependency and entry-point spike:** install the compatible published Atlas/UX package set through approved Nexus access. Start from the Todo-proven `0.1.0` family, React `19.2.7`, Vite `8.2.1` and TypeScript `6.0.3`; confirm the target shell before pinning. Provide a standalone Vite browser entry and a separate federation build over the same pages. Do not require Atlas source to install, build or start Flightdeck.
2. **Identity contract:** define operator identity and organization/project/environment authorization, plus a separately scoped evaluation credential. Use real verified identity where available; otherwise restrict the demonstration to explicitly local, disposable development identity and do not admit real organizational data. Viewer cannot mutate, editor can change flags, administrator manages scope/credentials.
3. **Persistence:** review the minimal organization/project/environment/boolean-flag/configuration/audit schema, ownership and indexes. Add migrations, restricted runtime grants, optimistic revision checks and atomic audit writes. A direct successful write publishes a new revision in this stage; do not introduce a second draft workflow before Stage 4 needs it.
4. **Management UI:** implement project/environment selection, bounded/searchable flag inventory, create, description/owner, detail, environment-specific enable/disable, archive and activity. Use actual Onebrief toolkit components and theme tokens, with loading, empty, error and keyboard states. Only show tabs backed by working capabilities.
5. **API and consumer:** define versioned management/evaluation OpenAPI contracts with runtime input/output validation, predictable errors and bounded results. Add a real backend consumer example with a declared fallback; keep its evaluation secret out of UI bundles. Show decision reason and configuration revision.
6. **Atlas adapter:** generate `atlas-app.json`, expose `./register` and open the same page in an unmodified, separately configured compatible shell. Do not add a shell home-card contribution unless needed for the agreed navigation flow.
7. **Developer workflow:** document and implement reproducible install, database setup, migrations, startup, build, lint, typecheck and behavioral test commands. Add genuine checks to CI as the implementation arrives.
8. **Onboarding record:** identify the platform owners and required identity, namespace, database, registry, network and deployment permissions. Record unavailable contracts explicitly; do not use Todo's fixed-owner token or the retired deployment intake as a substitute.

### Acceptance

- [x] From Flightdeck alone, install from its lockfile, migrate a clean database, build and launch the standalone UI/backend.
- [x] In the actual browser, create a flag, change one environment, inspect the decision and activity, then restart the backend and confirm the same identity/state remains.
- [x] A separate backend consumer receives the new boolean value and revision; an unrelated environment remains unchanged.
- [x] An unauthenticated request, a viewer write, wrong-project credential and cross-organization resource access are rejected without disclosing another scope's data.
- [x] Two writes against the same starting revision cannot silently overwrite one another; the losing write receives a conflict and no false audit success.
- [x] Runtime credentials cannot perform schema-owner operations. Migrations are tracked and safely repeatable.
- [x] Archived-key behavior is explicit and explained by the API; archival is not an unreviewed destructive delete.
- [x] The published-package remote loads in an unmodified separate Atlas shell; SDK navigation and both light/dark themes work without duplicating shell chrome.
- [x] Record actual build/lint/typecheck, database/API and browser results, plus the exact package/shell versions and any production-identity limitations.

**Checkpoint:** demonstrate “create → change → evaluate → audit → restart → evaluate again,” then show the same page in Atlas. Local demonstration is not production authentication, cloud deployment or a BC end-to-end walkthrough.

## Stage 2 — Enablements, targeting and configuration

Implement one evaluation model, not an Unleash/Flagsmith hybrid with ambiguous precedence:

- Explicitly typed configuration values, validated payloads and a distinction between enabled state, off value and selected variant.
- Ordered first-match rules with AND conditions, a configured default, reusable project-scoped segments and typed context definitions.
- Environment-scoped subject overrides with owner, reason and expiry. Show their priority; environment disable must dominate them.
- Deterministic percentage rollout and weighted variants using stable logical IDs, immutable namespace and a versioned hash specification. Use integer basis points with an explicit total.
- Explain-decision playground using the same evaluator as the API. Summarize “who → what fraction → what outcome,” including missing-data reasons and change/rebucketing previews.
- A tenant/account enablement workflow constrained by explicit service-credential tenant grants, not a second flag engine or an entitlement bypass. Local context is asserted by a trusted backend; authoritative BC user/tenant mapping is a Stage 3 gate.

Acceptance:

- [x] Permanent language-neutral evaluation cases cover precedence, missing/wrong-type attributes, negative operators, override expiry, disabled flags and unknown/archived keys.
- [x] Fixed subjects receive stable outcomes across requests/restarts; raising a rollout threshold preserves existing eligibility; display-name changes do not rebucket.
- [x] Validate weights and payloads before publication; adding/removing a variant previews reassignment rather than silently redistributing an active experiment.
- [x] UI playground and consumer API explain the same value, variant, matched rule and revision for the same context.
- [x] Segment and override changes cannot leak across organizations, projects or environments.

**Checkpoint:** demonstrate a tenant enablement, a staged rollout and a multivariate configuration against known contexts, including excluded/missing-context cases. Call this targeting and assignment, not experiment results.

## Stage 3 — BC consumption and reliable delivery

Implement a versioned backend client and one agreed real BC feature path. Coordinate BC adapter code in BC's own repository; keep Flightdeck implementation here.

- Agree BC-user/account-to-subject mapping and which signed/scoped caller claims establish permitted tenant context. Do not infer Atlas membership from BC identity.
- Define trusted consumer-supplied account, current-organization and effective-membership context. Add explicit typed collection/membership semantics before enabling group targeting; specify missing-data behavior and source/tenant scoping without stringifying collections.
- Keep optional BC directory search/resolve on the authoring path. Resolve friendly names/email to stable source-scoped IDs and author ordinary Flightdeck rules. BC remains authoritative for identities/memberships; Flightdeck owns segment definitions. Do not require replicated group-member lists for predicate segments or call BC's directory during evaluation.
- Implement and verify an OpenFeature provider adapter with a documented targeting-key/custom-context mapping before claiming compatibility. OpenFeature does not define BC-specific attribute names or directory integration.
- Add bounded evaluation, timeouts, predictable errors, credential rotation/revocation and per-feature caller-selected safe fallback.
- Specify delivery latency and freshness requirements. If measured requirements need caching or last-known-good snapshots, scope caches by organization/project/environment, validate revisions and impose a maximum age. Do not build edge/local SDK infrastructure speculatively.
- Add minimal latency/error/freshness signals without retaining sensitive contexts by default.

Acceptance:

- [x] A real BC browser interaction reaches BC's backend and consumes Flightdeck's managed decision. The homepage filter appeared after publication and page refresh; no server decision cache or push guarantee was added.
- [x] Browser code does not receive an evaluation secret or call Flightdeck with one. The provider is backend-only; management sessions remain separate.
- [x] Exercise cold start, timeout, malformed response, authorization and scope failures through real SDK/HTTP boundary tests. An actual BC outage/recovery and dedicated-credential revocation were also exercised; revoked authorization was an explicit 502, not false. Expired-cache behavior is inapplicable because no cache is implemented.
- [x] Provider scope is fixed per instance and wrong-scope responses are rejected. There is no decision cache that can satisfy another project/environment.
- [x] Stop the optional directory authoring transport and prove saved rules still evaluate consumer-supplied context. The owned connected recording observes new search HTTP 503 while fresh real BC bootstraps remain successful and keep the title filter visible.
- [x] Exercise exact collection membership, missing/wrong-type data and scope isolation. BC bootstrap supplies effective memberships; singular current organization is deliberately omitted because this route has no server-validated selection.
- [x] Verify Boolean/string/number/object decisions and context/error/default behavior through actual OpenFeature SDK calls, rather than inferring compatibility from API shape.

**Checkpoint:** BC walkthrough plus service interruption and credential revocation. This is the first proof of BC integration, not something inferred from a command-line API sample.

The first consumer checkpoint historically included the reusable local contract lab and separate opt-in BC `HOMEPAGE_CARDS_SHARED_TEXT_FILTER` change, with a fresh isolated database and no repair/reset of the inconsistent shared database. Its original records remain in [Stage 3 consumer checkpoint](stage-two-verification.md#stage-3-consumer-checkpoint). The later [unified verification](stage-two-verification.md#unified-redesign-verification) records the now-passing connected directory recording and direct ordinary lookup after the relay closed. The BC API remains a separate change, not a released capability; production identity/delegation, operational signals and shared-environment onboarding remain qualification work.

## Stage 4 — Lifecycle and operational controls

The approved unified replacement above brings local lifecycle, explicit segment publication and audit search into the current acceptance scope. Broader governance, scheduling, audit export, evaluation health and any additional configuration rollback remain later work, not implied capabilities. Historical segment restore always copies contents to a guarded draft before separate publication; it never performs an immediate live rollback. No remote change-request/notification workflow is part of master mode.

Acceptance:

- [ ] A reviewer can inspect the exact proposed change; a stale approval cannot publish an unrelated later edit.
- [ ] Any future configuration rollback preserves history and requires an explicit reviewed write; current segment history restores only as draft, followed by separate publication.
- [ ] Viewer/editor/administrator boundaries hold across APIs and UI; revocation affects outstanding actions according to the declared contract.
- [ ] Lifecycle indicators distinguish “no observed evaluations” from “safe to delete.” Archived flags and existing clients have an explicit compatibility policy.
- [ ] Operators can diagnose an update or evaluation failure without raw subject-context logs or browser-exposed credentials.

**Checkpoint:** local propose → review → publish → inspect audit → restore segment as draft → review again, including conflicting edits and insufficient-permission attempts. Broader operational qualification remains separate.

## Stage 5 — Experiments, not just random allocation

Design experiment measurement separately from flag assignment. Start with a supported two-variant experiment before expanding analysis or allocation modes.

- Explicit hypothesis, control/treatment, eligibility, randomization unit, primary metric, guardrails and attribution window.
- Stable independent namespaces for admission and treatment assignment; freeze assignment-sensitive configuration during a run.
- Actual-use exposure recording, distinct from evaluation/prefetch, plus conversion ingestion, validation, deduplication, late-event policy and multi-variant contamination handling.
- Sample-ratio mismatch (SRM), data freshness, metric definitions, exclusions and statistically reviewed uncertainty. Choose and document the analysis method and stopping/peeking policy; do not inherit vendor marketing claims.
- Review event-volume estimates, storage/warehouse choice, access controls, privacy, retention and cleanup before adding ingestion tables or infrastructure.

Acceptance:

- [ ] A deterministic event corpus produces independently computed expected assignments, deduplicated exposures and attributed conversions.
- [ ] Prefetch/evaluation without actual use does not count as exposure; conversions outside the agreed window are handled as specified.
- [ ] Detect a deliberately skewed allocation and report insufficient/stale/contaminated data instead of presenting an unsupported winner.
- [ ] Results expose denominator, uncertainty, freshness and analysis assumptions; statistics receive independent review before decision labels ship.
- [ ] The actual browser flow creates, starts, observes and stops an experiment without altering frozen assignments accidentally.

**Checkpoint:** walk a measured experiment from hypothesis through actual exposure to a defensible result. Assignment counts alone do not pass.

## Stage 6 — Atlas deployment and release qualification

Complete the environment onboarding initiated in Stage 1:

- Approved image/contract/Helm/Zarf publication and digest-pinned UDS bundle intake through enterprise Atlas deployment ownership.
- Flightdeck namespace, scoped resource permissions, database/roles/secrets, approved migration execution and explicit shell/database/BC network access.
- Browser routing, app registration, production operator/service identities and agreed tenant mapping.
- Secret rotation, retention/deletion policy, monitoring, backup/restore objectives and compatible application/schema rollback procedures.

Acceptance:

- [ ] Build and actually run Flightdeck's container image; validate/render its chart and package, then deploy an approved digest through the documented v2 path.
- [ ] Run migrations with the migration identity; demonstrate restricted runtime access and rejection of unauthorized network paths.
- [ ] In the deployed shell, author a scoped change and retrieve it through the intended deployed BC consumer.
- [ ] Verify production identity and tenant isolation, rotate a credential, and exercise backup/restore and a compatible rollback.
- [ ] Publish a runbook containing commands, observed signals, recovery steps and remaining operational limits.

**Checkpoint:** deployed end-to-end demonstration and recovery exercise. Local shell composition and an image build are not cloud deployment proof.

## Reference coverage and deliberate differences

Observed source capability is not a guarantee of vendor free-edition availability. Unleash advertises some governance/segmentation features as paid; Flagsmith documents some RBAC/stale detection capabilities as commercial. Flightdeck's scope is a product decision, not a copy of their edition boundaries.

| Area          | Unleash reference                                                    | Flagsmith reference                                              | Flightdeck choice                                                                               |
| ------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Scope         | Project definitions, environment state                               | Organization → project → environment, environment identities     | Explicit control-plane organization/project/environment; separate BC evaluation subject         |
| Configuration | Boolean decision and typed variant payloads                          | Enabled state plus string/integer/boolean values                 | Boolean first; explicit typed config in Stage 2                                                 |
| Targeting     | OR strategies; AND constraints/segments                              | Identity override, ordered segment override, environment default | Ordered rules with AND conditions and explicit precedence                                       |
| Allocation    | Stable stickiness/group IDs; weighted variants                       | Stable subject allocation and multivariate state                 | Versioned deterministic bucketing, stable variant IDs and reassignment warnings                 |
| Management    | Environment columns, flag detail, strategies, variants, activity     | Explicit identities, overrides, ownership and audit              | Approved unified local Flags/Segments/Audit views; read-only master reports in Onebrief toolkit |
| Experiments   | Variant assignment and evaluation metrics; some impact support gated | Exposure/conversion workflow and experimentation data/analysis   | Separate measured-experiment stage, with actual exposure and independent statistical review     |

### Source paths at the revisions in the architecture

- Unleash: `src/lib/features/feature-toggle/feature-toggle-store.ts:32-59`, `src/lib/features/playground/feature-evaluator/client.ts:139-223`, `src/lib/openapi/spec/variant-schema.ts:10-66`, `src/lib/features/apitokensv2/api-token-v2-types.ts:3-32`.
- Unleash UI: `frontend/src/component/project/Project/PaginatedProjectFeatureToggles/ProjectFeatureToggles.tsx:225-353`, `frontend/src/component/feature/FeatureView/FeatureView.tsx:41-60`, `frontend/src/component/feature/FeatureStrategy/FeatureStrategyForm/StrategyFormBody.tsx:265-386`.
- Flagsmith: `docs/docs/flagsmith-concepts/data-model.md:17-83`, `docs/docs/flagsmith-concepts/segments/index.md:39-69`, `api/features/feature_states/models.py:25-84`, `api/features/multivariate/models.py:51-73`.
- Flagsmith experiments: `docs/docs/experimentation/create-an-experiment.md:19-67`, `docs/docs/experimentation/run-an-experiment.mdx:310-313,398-422`, `api/experimentation/results_query.py:29-49`, `api/experimentation/stats.py:53-108`.
- Edition caveats: `unleash/README.md:165-186`, `flagsmith/docs/docs/administration-and-security/access-control/rbac.md:7-22`, `flagsmith/docs/docs/managing-flags/stale-flags.md:35-40`.
- Atlas entry point and identity: `src/packages/vite-config/index.mjs:39-62`, `src/packages/sdk/src/platform.ts:3-7`, `src/packages/bff-kit/src/index.mjs:62-73`; package/deployment documentation linked in the architecture.

### Licensing boundary

The inspected Unleash checkout is AGPL (`LICENSE`, README license declaration), not an assumed permissive code template. Use independent implementations of product concepts; do not copy its components, evaluator, styles or enterprise source without legal review. Flagsmith's root is BSD-3-Clause (`LICENSE.md`); any approved source reuse still needs attribution and third-party/enterprise rights review. Stage 0 copies no implementation from either product. Flightdeck's own publication/license policy must be established before a public release.

## Checkpoint report format

At each stage, report:

1. What was implemented and which acceptance criteria are satisfied.
2. Exact commands/scenarios run, observed results and where to see the product behavior.
3. What those checks do not prove and any unavailable external prerequisite.
4. Decisions or scope changes needing user input, if any.
5. Next stage's concrete deliverable.

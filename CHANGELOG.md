# Changelog

## Unreleased

- Remove global flag/segment creation shortcuts from sidebar and compact navigation. Place Create flag beside Reload flags in the flag library header, matching segment library actions, while preserving authorization and unsaved-creation guards.
- Integrate the approved unified redesign: deployment-fixed local Flags/Segments/Audit trail, secondary settings and read-only master observation. Record successful integrated local checks, 353 tests, standalone/Atlas browser flows and four recordings; earlier entries below remain historical checkpoints, not production qualification.
- Align flag and segment creation with the unified mockup's dedicated screens, retaining project/environment context, unsaved-change guards, Off-only local flag creation and non-live segment drafts. Keep short confirmations and existing-draft editing in dialogs.
- Present lifecycle choices as large, keyboard-accessible cards grouped by temporary delivery versus long-lived purpose. Retain all creation fields and derive lowercase underscore-separated keys from Name until manually customized; existing flag keys remain immutable.
- Match segment creation to the mockup's numbered People & memberships / Trait rules cards, OR divider, inline metadata and persistent selected cards. Search the three synthetic people, organizations and groups directly without opt-in clicks or demo/source-switching chrome; keep fixtures marked in code and separately tenant/source-guarded, and leave live flag authoring unchanged.
- Add person/organization/group icons and compact target chips with total/type counts, a six-item preview and a filterable scrollable View all list. Preserve removal/undo and full labels; support hundreds of segment targets through existing 20-ID batches within the unchanged shared 20-block budget.
- Group existing segment identity, inspected version, audience summary and publication boundary into one overview card. Keep All segments navigation and Create/Reload actions together in the page header. Add accessible Definition/Where used/Version history tabs with card-contained content, full-width audience/trait sections and a consolidated compact membership view while preserving published/draft/history and restore boundaries.
- Repeat the inspected published/draft version beside the segment's Audience and trait rules heading, including the draft's non-live state, so the lower definition stays visibly tied to the selected snapshot.
- Contain the segment library's filters, table and empty states in a bordered card. Restyle segment/flag navigation as unboxed, keyboard-accessible links consistent with the inventory while preserving destinations and narrow-screen table scrolling.
- Limit each segment-library reference preview to three flags and offer **View all N flags** to open that segment's complete Where used view, preserving the library search on return.
- Style affected flag names in segment publication review and Where used as unboxed navigation links, retaining keyboard focus cues and existing flag destinations without publishing the draft.
- Align flag detail with Lifecycle, Published behavior, full-width Audience and a separate full-width Test a context row. Expand audience editing in place and match Create segment's compact, always-visible membership search, grouped results and retained chips. Use debounced live directory lookup without changing source/tenant or targeting limits. Keep Advanced controls below both blocks, and validate drafts before one explicit targeting-review modal.
- Unify flag audience lookup across people, organizations, groups and published Flightdeck segments. Replace the separate segment button/list with typed filters, grouped results and one removable/undoable chip selection; keep segment lookup independent of directory connectivity and preserve publication, tenant/source and targeting limits.
- Make flag-inventory lifecycle headings span the full table and independently collapse/expand their rows, open by default with keyboard and accessible disclosure controls. Selecting a lifecycle filter automatically expands its group without resetting other collapse choices. Separate table-heading styles from create-form lifecycle cards; preserve filters, pagination and flag state.
- Open audit events from the whole table row and switch the results to a compact UTC date/action/object navigator beside read-only detail. Preserve full metadata/snapshots, selected-event indication, keyboard access and filtered-page/focus restoration on close; stack the bounded list on narrow screens.
- Group audit detail into separate summary/metadata, before/after, recorded-impact and history-boundary/action cards using Onebrief surfaces, borders and spacing. Preserve raw snapshots, empty-impact states, compact navigation and keyboard focus while reflowing metadata on narrow screens.
- Move flag metadata, archive state, revisions and Development/Release/System/Permissions lifecycle into local environment scope; creation starts Off only locally.
- Replace per-flag segment pins with current-published following references. Separate guarded drafts/publication/history/restore, OR blocks with AND traits (including `ends_with`), and atomic publication impact without changing flag revisions, gates, direct selections or unrelated drafts.
- Preserve immutable event-time audit and consumer tenant/source trust boundaries; do not imply production identity, remote writes, directory-dependent evaluation or SDK delivery proof.
- Preserve migrated flags whose followed segment metadata exceeds the flag-owned storage allowance, retaining complete captured definitions and operands while independently bounding evaluation trace complexity. Capture only directly used flag context definitions so a full custom catalog still permits built-in directory predicates. Lock schema editing during pending saves to prevent late draft edits being overwritten.

### Earlier local checkpoints (historical behavior and evidence)

- Upgrade Zod to 4.6.7 and publish provider 0.1.1 with versioned compiled JS/declarations, removing consumer-side preparation scripts and build approvals from the Git-pinned distribution.
- Add bounded string-list context and exact any/all membership targeting throughout validation, the evaluator, catalogs and the advanced playground.
- Add an independently packaged server OpenFeature provider with typed detail methods, scope/response validation, bounded deadlines and explicit authorization-versus-recovery policy.
- Add a reusable loopback consumer lab with server-owned synthetic personas, real persisted flag decisions, typed configuration, explicit transport-failure scenarios and private scoped credential provisioning.
- Align the HTTP envelope allowance with separately bounded preview context/configuration and cover the maximum context through actual HTTP/provider/SDK evaluation and preview.
- Document the separate opt-in BC homepage-filter mapping, fresh actual-tenant admission and trusted context without claiming production identity or deployment.
- Add a Flightdeck-owned Playwright demo harness with caption/chapter overlays, a visible cursor, real consumer scenarios, automatic local-service startup/reuse and successful-scenario MP4 export; keep recordings and private configuration ignored.

- Simplify Boolean flag details to Everyone or selected Flightdeck segments, with empty selections matching nobody and OR across segments through the existing evaluator.
- Preserve typed configuration, rules, rollouts, variants, diagnostics and draft state behind working advanced disclosures; refuse lossy conversion of existing advanced configurations.
- Add optional private BC directory authoring connections with editor/admin search and resolve, viewer status only, stable IDs and explicit unavailable states; configured status is not a health assertion.
- Author direct people/organization/group audiences as ordinary tenant/source-guarded branches OR with segments, and add an AND-predicate segment helper that preserves existing advanced conditions and saves only with the catalog draft.
- Separate explicit BC targeting-field catalog preparation from flag publication; preserve incompatible existing types, advanced configurations and stale selected IDs without membership replication or evaluation-time directory calls.
- Add an opt-in, Flightdeck-owned connected BC recording with a same-account false-to-true control, real authoring-transport interruption, directory-independent BC evaluation and guarded configuration restoration. Keep private credentials/recordings ignored and production onboarding separate.
- Match BC's HTML5 email validation and 255-character persisted-address bound in directory responses, preserving valid addresses through search and resolution.

- Clarify shared project flag ownership: show one inventory row with per-environment gates, explicit Projects navigation and environment-specific detail links. Preserve inventory search/page when switching configuration environments.
- Replace environment GET inventory with bounded project summary reads; retain scoped creation/detail/mutation contracts and verify shared identity, project isolation, archived gates and missing configuration behavior.

- Add Stage 2 typed boolean/string/number/JSON configuration, ordered AND targeting rules, reusable typed project segments and explicitly pinned catalog snapshots.
- Add versioned deterministic rollout/variant assignment, language-neutral decision/hash vectors, scoped expiring subject overrides and atomic configuration/catalog/override audit history.
- Add structured Onebrief-toolkit authoring, first-match rule ordering, current/draft decision traces, explicit reassignment review and read-only viewer simulation in standalone and Atlas.
- Preserve unpublished configuration drafts, decision previews and simulation context while inspecting Activity or Subject overrides.
- Replace the preproduction GET/boolean evaluation contract with POST context and tagged values; migrate the backend client and require explicit credential tenant grants. Existing local credentials are restricted to `local-tenant`.
- Migrate existing flags without resetting identity/state; track migration files by checksum and retain separate migration/runtime privileges. Record Stage 2 runtime/browser evidence and remaining BC/identity/deployment gates.

- Add the runnable Stage 1 standalone Onebrief-toolkit UI and independently built Atlas federation adapter, including dark/light themes, project/environment inventory, flag creation, metadata, confirmations, archive/restore, decision preview and activity.
- Add PostgreSQL persistence, owner-run tracked migrations, restricted runtime privileges, organization/project/environment authorization, atomic audit history and optimistic revision conflicts.
- Add versioned runtime-validated management/evaluation APIs, scoped one-time evaluation credentials and revocation, and a separate backend consumer with explicit timeout/fallback behavior.
- Add isolated local database provisioning, signed loopback-only development sessions that refuse production mode, real application checks and PostgreSQL/session behavior tests.
- Record local smoke/browser evidence, current feature requirements, reproducible commands and outstanding identity/deployment onboarding gates.
- Establish the staged Flightdeck delivery plan and architecture for independent ownership, Onebrief toolkit UI, Atlas composition and BC backend consumption.
- Add BC-derived Oxfmt configuration, pinned formatting dependencies/toolchain, contributor standards and a formatting CI workflow.
- Record identity, evaluation, experiment measurement, licensing and deployment qualification gates before application implementation.

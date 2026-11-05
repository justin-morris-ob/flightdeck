# Stage 2 verification — local targeting and configuration

This records observed local execution, not a production certification. Stages 0–2 are implemented; BC integration, verified production identity, shared deployment and experiment measurement remain later gates.

## Environment and commands

Used Node `26.12.1`, pnpm `11.23.0`, dedicated PostgreSQL 17 Compose storage and the existing compatible published Atlas/UX Kit `0.1.0` package set. No dependencies were added in this stage. Flightdeck ran at `http://localhost:4721`; a separately configured, unmodified Atlas checkout ran at `http://localhost:4720`.

Executed:

- `pnpm db:setup`: applied `002-targeting.sql` to existing application/test databases without resetting application storage.
- `pnpm fmt`: completed successfully with BC-derived Oxfmt.
- `pnpm check`: Oxlint reported zero warnings/errors; frontend and native-server typechecks passed; generated OpenAPI matched runtime schemas; standalone and federation builds passed; formatting check passed.
- `pnpm test`: initial Stage 2 integration passed 109 tests across four files; shared inventory passed 110 across four files; the subsequent UI-first simple-audience pass passed **135 tests across five files**. Runtime/browser evidence for each refinement is below.
- Separate native-Node HTTP smoke script: exited successfully after the persisted/API scenarios below. The temporary ignored script/result were removed after verification.
- Separate `pnpm consumer` processes: observed real service decisions with tagged string and JSON values, rule/variant IDs, revisions and deterministic traces.

No new cloud deployment, container execution or Stage 2 frozen reinstall is claimed. Stage 1 records the original lockfile installation proof. The first PR's [hosted CI attempt](https://github.com/justin-morris-ob/flightdeck/actions/runs/41944114954) later failed at dependency installation because Nexus returned 401 for UX Kit; hosted application checks did not run. Spud also refused the personal repository with `repository-forbidden`. Neither remote gate is represented as passed.

## Evaluator and boundary proof

The permanent portable corpus contains 59 decision cases and 16 independently calculated Python `hashlib` hash vectors. Tests exercise precedence, unknown/archive/disabled gates, typed values, missing/wrong-type attributes, explicit presence/absence, negative comparisons, exact override expiry/scope, first-match/AND behavior, independent hash purposes, UTF-8/delimiter encoding and exact rollout/variant interval boundaries. Additional assertions cover monotonic admission, display-name stability and publication validation.

Actual direct engine smoke initially exposed built-in tenant predicates reading the custom-attribute object instead of top-level context. The implementation was corrected and permanent built-in context cases added. Actual PostgreSQL tests initially exposed unchanged segment restoration incrementing revision because JSONB object key order differed; semantic condition comparison fixed that failure without weakening the expected revision.

## Migration, API and durable data

Before migration, captured existing `new-workspace-navigation` ID `814fd7a6-c85f-4d32-89f2-c1bc931f7197`, revision 5 and enabled state. After migration, HTTP reads preserved that identity/revision/state and provided boolean off false/default true configuration. The application database was not reset.

Observed HTTP/consumer scenarios:

- Published tagged string, number and JSON configurations. Invalid weights, namespace changes and stale catalog revisions were rejected.
- Same context produced matching operator-preview and credential API decisions. Preview did not write configuration. A renamed flag retained assignment; admitted/excluded subjects and missing/wrong-type attributes followed the declared rules.
- Reloaded/restarted backend retained the targeted flag and deterministic decision. Later browser publications deliberately changed its reviewed weights; those were not mistaken for instability.
- Catalog changes alone left published decisions pinned. Explicit refresh/preview/publication changed the pinned snapshot and its resulting targeting.
- Exact scoped override took precedence over rules, incompatible variant publication was rejected, environment disable dominated the override, and revocation restored rule evaluation.
- Other environments remained independent. Wrong tenant, project or environment credentials received 403. Removed GET evaluation returned 404. Viewer writes failed while viewer preview worked; isolated organization resources remained hidden.
- Configuration and override mutations produced actor-attributed audit entries. Real database tests exercise catalog history, scoped persistence, conflict rejection, migration idempotency and restricted runtime privileges.
- Consumer boundary tests reject wrong-scope or wrong-tagged-type responses and never hide a tenant authorization failure behind fallback.

## Actual standalone browser

Used real Onebrief-toolkit forms and confirmation dialogs, not injected configuration:

1. Opened the persisted targeted string flag, inspected its 5000-basis-point enterprise tenant rule and weighted variants, and supplied `local-tenant` / `person-0` / `plan=enterprise` in the playground.
2. Entered an invalid 11000 total weight: the UI rejected it. Corrected weights from 50/50 to 60/40, observed current `preview` versus proposed `control`, reviewed reassignment warnings and explicitly published to Development.
3. Added typed string attribute `region` and reusable `west-region` segment through the project catalog form. The catalog advanced to r5; existing live configuration stayed pinned to r4 with an explicit refresh warning.
4. Created a typed subject override with owner, reason and future expiry; actual simulation returned `ui-override`. Revoked it through confirmation; rule evaluation resumed. No active verification override remains.
5. Created `stage-two-json-ui` (Remote configuration document). Invalid JSON was blocked by actual native form validity. Published a valid JSON default and enabled Development.
6. Added a full-rollout tenant-specific JSON rule and a catch-all rule. Moving catch-all first changed the preview to its payload; moving it back restored the tenant payload. Published the reviewed ordering, reaching r4.
7. The separate backend consumer then returned JSON `{"layout":"tenant","limit":5}`, reason `rule`, flag r4/catalog r5, for that UI-authored configuration.

Browser inspection exposed a real layout bug: Atlas toolkit's `reply` block behaves as a sticky composer and overlapped the large configuration form. Lifecycle and playground blocks now use normal content layout. Rebuilt assets and actual block geometry/visual inspection confirmed separate, non-overlapping content. Both light and dark surfaces were inspected.

## Actual separate Atlas shell

Loaded Flightdeck's independently built remote in the unmodified shell, signed into its demo identity independently, and opened the same targeted flag at r13. Embedded admin preview for the same context returned `control`, preserving the pinned r4 decision while explicitly showing a proposed catalog-r5 refresh.

Switched the shell from dark to light and switched Flightdeck to synthetic viewer Vera Singh. Authoring controls were disabled, publication controls absent, and published simulation still returned `control`. The embedded page contained no standalone chrome. Actual screenshots were visually inspected in both themes. A request-aborted diagnostic occurred during the deliberate Flightdeck sign-out transition; subsequent viewer sign-in and server simulation completed successfully. This is not a claim of a pristine browser diagnostic log.

## Try the retained examples

Open Flightdeck / Development as Alex Morgan:

- **Stage Two targeted release** (`targeting-b986e9d4-release`): tenant `local-tenant`, subject `person-0`, string attribute `plan=enterprise` selects `control` under the current 60/40 weights; `person-2` is excluded by the 50% rollout. Missing plan selects the configured default. Current catalog r5 versus pinned r4 intentionally demonstrates explicit pinning.
- **Remote configuration document** (`stage-two-json-ui`): tenant `local-tenant` matches the first full-rollout rule and selects the tenant JSON document. No stable subject is needed for this fixed-value 100% rule.

These are mutable local demonstration records, not seeded fixtures or guarantees that another checkout contains them. Temporary numeric/JSON API-smoke flags were archived rather than destructively deleted; audit remains available.

## Recorded demonstration

A subsequent real browser recording is retained locally at `.local/demos/flightdeck-stage-two-complete-demo.mp4` (silent H.264, 1440×1000, 2m54s). It joins standalone authoring, overrides/Atlas, and a recaptured viewer-only ending. Encoded final frames were inspected, not just the live browser. Video is deliberately ignored rather than committed or claimed as a remotely hosted artifact.

- Created `recorded-demo-mw2tio41` through the UI, published/enabled/reloaded it and inspected actor-attributed audit. A separate backend consumer returned JSON `{"limit":12,"layout":"recorded-demo"}`, reason default, flag r3/catalog r5.
- Previewed 60/40 → 50/50 reassignment on the existing targeted flag and cancelled publication, preserving its original weights/pinning.
- Created an exact temporary override: the backend returned `recorded-override` at r14. Revoked it through the UI: the same backend context returned `control` at r15, with rollout bucket 3164 and variant bucket 5137. `person-2` returned `excluded`, rollout bucket 8550.
- An unauthorized tenant received 403 and the consumer exited 1 explicitly refusing fallback.
- Opened the newly created data in the separate Atlas shell and recorded catalog inspection, both themes and successful read-only viewer simulation. No active demonstration override remains.

## Pre-PR review correction

An independent frontend review identified silent loss of unpublished configuration when visiting Activity or Subject overrides. Actual browser reproduction confirmed the draft reset to published JSON after a tab roundtrip. The detail now keeps the configuration editor mounted but hidden on other tabs, preserving its draft, undo/preview and simulation context. A fresh browser run confirmed draft, context and preview survived both detail tabs; the hidden panel had computed display none, and explicit Discard still restored the published value. Full `pnpm check` and all 109 tests passed after the correction. No changes from this smoke were published.

## Shared inventory refinement

The follow-on organization refinement changes presentation and operator reads, not flag ownership or evaluation semantics. No database migration/reset or toolkit dependency change was needed.

- `pnpm check` passed lint, both typechecks, OpenAPI consistency, standalone/federation builds and formatting. `pnpm test` passed 110 tests across four files, including a real-DB summary case and migrated inventory authorization/pagination/archive tests.
- A separate native Node 26 HTTP smoke verified project-level summary/detail parity: `targeting-b986e9d4-release` retained ID `4a00465e-e1ab-4dc1-87b1-4676b35e047b` in both Development (On) and Production simulation (Off). It also observed inaccessible-project 404, invalid limit 400 and removed environment GET list 404. The smoke did not mutate flags.
- Actual standalone browser inspection showed Projects navigation and one row per flag with environment columns, in dark/light themes. Filtering to “Stage Two,” then switching configuration environments retained the search and single-row result. Clicking Production's Off cell opened Production detail; switching the same flag to Development showed its existing On state. Sandbox navigation showed its separate empty inventory.
- Created `shared-config-mw375idx` (“Shared configuration example”) through the actual UI while Production simulation was selected. Both gates started Off; enabling only Development produced one shared row with Development On and Production Off. The project-wide archive warning explicitly identified both environments; it was cancelled. The new demo remains active, with all preexisting records retained.
- The project targeting catalog did not show an environment selector. Archived inventory rows displayed their lifecycle separately from saved gates.
- The independently built page loaded in the restarted, unmodified separate Atlas shell. A synthetic viewer saw the same five shared rows and could open Production detail, but had no create or enable controls. No standalone chrome was present. Both shell themes were visually inspected.

## UI-first simple audience refinement

The user explicitly selected UI simplification before building a BC directory bridge. No BC files, identity credentials, server directory endpoints, replicated directory data or database migrations were added.

- `pnpm check` passed lint, both typechecks, OpenAPI consistency, standalone/federation builds and formatting; `pnpm test` passed 135 tests across five files. The new deterministic helper tests use the actual evaluator to cover Everyone, empty selected audiences, OR versus AND, wrong/missing attributes, stable retained rule IDs, bounds and refusal to rewrite advanced shapes.
- In the actual standalone browser, created `simple-targeting-mw38e63c` (“Simple targeting example”), enabled Development, selected no audiences and explicitly published. A real evaluation returned Boolean false at version 3 despite matching-looking synthetic attributes: empty Selected did not become Everyone.
- Selected two existing Flightdeck predicate segments through the simple editor. Draft selection survived opening/closing Advanced controls and a roundtrip through Activity. Published through simple review while Advanced stayed closed.
- A separate native Node 26 process evaluated the persisted union at version 4: enterprise/east matched the enterprise segment; basic/west matched the west segment; basic/east and missing attributes returned false. Each admitted context matched a different rule, proving OR rather than intersection.
- Explicitly changed to Everyone and observed an otherwise excluded context return true at version 5. Disabling Development returned false with reason disabled at version 6. Re-enabled and restored the two-segment audience; the retained demonstration is version 8. Production simulation stayed unconfigured/disabled.
- All three BC directory fields were natively disabled and labeled disconnected. These checks did not use real BC users or claim verified membership.
- Captured both environment configurations of the existing string/variant and JSON demonstration flags before this UI change; all four full flag snapshots matched afterward. The string flag still had weights 6000/4000 and its existing namespace/rules. Opening Advanced and simulating `local-tenant` / `person-0` / `plan=enterprise` still returned control.
- Entered invalid JSON in the existing advanced editor, closed its disclosure, and observed the visible invalid-configuration notice outside it. Restored the raw input without publishing. Existing JSON configuration was not converted or overwritten.
- Visually inspected standalone and separate unmodified Atlas pages in both themes. Atlas contained no standalone chrome; a synthetic viewer saw disabled audience/review controls and no gate-mutation action. Working advanced functionality remained available, not mislabeled under development.

## Stage 3 consumer checkpoint

This follow-on checkpoint adds generic membership context, an independent server provider and a reusable consumer lab. The BC adapter is owned by its separate repository/PR, not imported from a local checkout. No new Flightdeck migration or directory integration was required.

- `pnpm check` passed lint, frontend/server typechecks, OpenAPI consistency, the independent provider build, standalone/federation/consumer-demo builds and formatting. `pnpm test` passed **239 tests across seven files**.
- Review found the exact-32-KiB context exceeded the old whole-body cap after adding its request envelope. A new real PostgreSQL/HTTP/provider/SDK test reproduced the failure before the fix (238 passed, one failed). The corrected 64-KiB transport envelope retains independent 32-KiB context and 24-KiB input bounds; the regression proves a targeted true result and current/proposed preview at the exact context limit, and rejects one byte beyond it.
- `pnpm demo:seed` created real Sandbox / Development flags and a source-scoped Alpha-pilot segment, retaining existing records and storing a dedicated `consumer-demo` credential privately. The separately running lab at port 4722 consumes these through the actual SDK/provider. Mira and Rowan returned true; Kai returned false. String, numeric and object calls returned `Welcome from Flightdeck`, `12`, and `{\"density\":\"compact\",\"showSummary\":true}`.
- Actual browser checks showed filtering to Alpha, decision clearing when switching persona, included/excluded membership behavior, both themes, a visibly marked recovery default, and a real denied-tenant error. Extra browser-supplied context received HTTP 400. Unavailable/malformed transports are intentionally simulated; invalid-token and denied-tenant calls hit Flightdeck itself and became explicit consumer HTTP 502 authorization failures.
- Built the independent provider tarball containing only compiled JS, declarations and its manifest, then installed it into the clean BC worktree without Atlas/Flightdeck source imports. Final dependency publication must use the immutable Git/subdirectory pin recorded in the BC PR, not the temporary local artifact used for initial verification.
- BC's selected test command passed **60 backend tests across four files** and **22 homepage tests**; the latter emitted jsdom network warnings despite passing. Backend typecheck and build passed. Lint passed with zero errors and existing repository warnings. No claim of a full monorepo test run is made.
- The dedicated BC Compose project used PostgreSQL 55481 and Redis 56481/56482. Fresh migrations completed from version 0 to 760, including 752/753. The known failing shared database was untouched. The real compiled backend ran at 4741 and the independent browser frontend at 4740.
- Created one synthetic account through BC's actual signup UI. Session bootstrap supplied canonical account UUID and empty effective membership lists; no current organization was fabricated. In Flightdeck, explicitly reviewed/published Everyone for `bc-homepage-title-filter`, then refreshed BC: `HOMEPAGE_CARDS_SHARED_TEXT_FILTER` changed false → true and the real homepage search appeared. Comparing the entire bootstrap key set showed no other flag changed. The existing homepage had no brief records; this proves feature availability, not populated-list filtering across real BC memberships.
- Stopping the actual Flightdeck service left BC bootstrap at HTTP 200 with its existing BC-evaluated false; no other flag changed. Restarting Flightdeck returned true on the next bootstrap without restarting BC. Revoking the dedicated BC credential yielded sanitized HTTP 502 `Flightdeck evaluation authorization failed`, while anonymous bootstrap remained HTTP 200 with null context. A newly issued credential, configured privately and activated by a BC restart, restored successful evaluation.
- Restored the demo flag's exact original configuration after the walkthrough (new revision 5). BC then returned false again; consumer lab pilot membership remained targeted. Videos are ignored local evidence under `.local/demos/stage3-consumer-lab.mp4` and `.local/demos/stage3-bc-integration.mp4`; no credential or recording is committed.

## Limits and next stage

- Credential tenant grants constrain evaluation but do not verify BC user/account membership. Traits are asserted by the trusted caller. The operator picker and Atlas shell names remain synthetic development identities.
- Rollout and variant decisions are assignment only. No exposure ingestion, metrics, analysis or experiment results are implemented.
- No production issuer, shared-environment authorization, retention/recovery SLA, artifact publication, network admission or cloud deployment was qualified.
- OpenAPI version 2.1.0 adds bounded string-list context and documents the enlarged request envelope. Version 2.0.0 replaced the local preproduction boolean/GET contract with tagged POST decisions. Neither is a production-stable external API promise.
- Next: optional supported BC directory lookup/resolve for authoring, plus production identity/delegation and deployment qualification. The implemented local BC path does not establish cloud networking, production authentication or nonempty real-BC membership walkthroughs.

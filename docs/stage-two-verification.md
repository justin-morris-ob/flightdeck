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

## Flightdeck-owned recording checkpoint

- Added committed Playwright scenarios, page model, caption/chapter/cursor helpers and MP4 reporter under `demo/recordings/`, with root `demo:install` / `demo:record` commands. No BC checkout, browser session or harness import is required.
- Frozen dependency installation, Chromium installation, `pnpm check` and all 239 existing tests passed. Both recorded scenarios passed with existing services and again with both application ports initially closed. The cold run started Flightdeck, seeded/started the consumer lab, exported both MP4s and left both recorder-owned ports closed afterward. Reused services were retained in the earlier run.
- The scenarios prove live included/excluded/multiple-membership decisions, Alpha filtering, string/number/object values, explicitly simulated unavailable/malformed fallbacks, real denied-tenant HTTP 502 and live recovery. They never publish managed configuration. Encoded 1440×1000 H.264 videos were visually inspected for captions, cursor and real application outcomes.
- A throwaway ffmpeg failure probe let the browser scenario pass but forced conversion to exit 17. The recording command exited 1; the selected scenario's old MP4 and incomplete export were absent. The probe was removed and a normal cold run regenerated successful clips. Production-mode configuration loading was also explicitly rejected.
- Outputs are ignored `.local/demos/should-consume-live-targeting-and-typed-configuration.mp4` and `.local/demos/should-distinguish-simulated-fallback-from-live-tenant-denial-and-recovery.mp4`. Raw recordings/failure screenshots remain ignored under `.local/demos/results/`. These are local synthetic consumer demonstrations, not a production deployment, BC identity proof or a hosted video attachment.

## Stage 3 connected BC directory checkpoint

Flightdeck now owns an optional authoring connection; BC's supported directory API and existing consumer integration remain separate unmerged changes in BC's repository. Neither implementation imports the other's checkout. The generic evaluation service and provider do not call the directory.

- Flightdeck `pnpm check` passed with zero lint warnings/errors, both typechecks, OpenAPI consistency, provider/standalone/federation/lab builds and formatting. `pnpm test` passed **339 tests across nine files**. Real socket/PostgreSQL tests cover operator/service/viewer boundaries, persisted scope isolation, OAuth/response/timeout/size behavior, guarded audience compilation and normal evaluator outcomes.
- The maximum-supported source ID initially produced an invalid overlong generated rule name. Its new regression failed before the display-name-only bound and passed afterward, retaining the full identity predicate. A real-socket prefixed-deployment regression also failed before OAuth/search/resolve preserved the configured BC pathname, then passed after the correction.
- A fresh workspace installed provider Git commit `db0f20c64099065012efa7135248f99459ceb45f` with install scripts disabled and imported the committed compiled entrypoint. A real OpenFeature SDK request returned a live true targeting decision at revision 12. The throwaway workspace was removed after proof; credentials remained private.
- The repaired BC consumer passed 286 focused unit tests, 12 fresh-tenant/membership database cases, backend typecheck/lint/build and changed-file formatting. Its tenant admission now reads current account storage, filters outbound memberships to active tenant-owned targets and omits internal metadata from browser bootstrap. Existing legacy arrays remain unchanged. The pinned provider resolved in the actual host build; Docker/pruned-container execution was not exercised.
- The separate BC directory passed 183 focused unit tests, four real SQL tests in a disposable PostgreSQL container, and 47 real HTTP integration tests in harness-owned Testcontainers storage. All three affected package typechecks/lints, the server/dependency build and changed-file formatting passed. Prefix-aware JSON and early form-body rejection regressions were observed failing before correction. Live final-build requests also returned 413 for oversized JSON and 415 for form bodies at both directory resolve and credential issuance. Root BC `pnpm fmt:check` failed on untouched inherited files in unrelated packages; no unrelated formatting was changed.
- Through supported BC administration, provisioned a disposable actual tenant, assigned the existing synthetic Mira account, created an organization and pilot group, and persisted both memberships. A tenant-authorized directory-only credential issued with HTTP 201; the existing OAuth endpoint returned Bearer/60 seconds. Actual people partial-email, organization and group searches returned HTTP 200 with only the expected minimal records.
- In the real Flightdeck browser, explicitly prepared the standard catalog fields, selected Mira by partial email, selected the actual organization/group, reviewed and published the three ordinary tenant/source-guarded branches, and enabled only Development. A real BC bootstrap returned true with nonempty organization/group lists and no internal `flightdeck` metadata; the actual homepage title filter was visible.
- Created `bc-demo-pilots` through the project catalog's directory helper and Save. Its three predicates were tenant equality, source equality and `groupIds contains_any ["1"]`. Removed the direct selections, selected only that Flightdeck-owned segment and explicitly published a pinned snapshot at catalog revision 7. BC continued returning true with its actual persisted memberships.
- The committed opt-in connected recording exercised the same authenticated BC account with an empty audience (false and no filter), then selected the real group through Flightdeck's UI, published it and observed true with the real filter visible. Stopping the demo-owned transparent authoring relay—not BC—made searches return 503 and labels unavailable without dropping saved IDs; fresh BC bootstraps remained successful/true. The recorder restored the dedicated flag's original configuration through revision guards and closed its relay. A redundant navigation initially invalidated a response body; removing that navigation produced a successful recording rather than suppressing the assertion.
- Final `FLIGHTDECK_BC_DEMO_CONFIG=.local/bc-directory/demo.json pnpm demo:record` passed all three owned scenarios after the page-model extraction and final builds. It exported the connected clip plus both existing consumer-lab MP4s, proving the separate Sandbox examples still worked. Captions, the unavailable-ID state and the real BC filter were visually inspected in encoded output.

The captioned H.264 clip is ignored at `.local/demos/should-author-a-real-bc-group-and-evaluate-through-an-authoring-outage.mp4`; encoded frames were inspected. Setup and the exact opt-in command are documented in [local development](local-development.md#record-connected-bc-directory-authoring). The scenario refuses Sandbox/unmarked flags, masks the private password, disables traces/screenshots and aggregates primary/restoration failures. Its relay forwards actual BC responses and retains only credential-free method/path counters.

This is a local authoring/evaluation proof using disposable persisted BC records, not production operator identity, shared-network/TLS onboarding, cloud deployment, populated-list filtering or experiment results.

## Limits and next stage

- Flightdeck's evaluation grants constrain tenant scope while the trusted backend asserts context. The separate BC adapter now derives local admission/memberships from fresh BC storage; a production delegation and operator-identity contract is still unqualified. Atlas shell names and Flightdeck's operator picker remain synthetic development identities.
- Rollout and variant decisions are assignment only. No exposure ingestion, metrics, analysis or experiment results are implemented.
- No production issuer, shared-environment authorization, retention/recovery SLA, artifact publication, network admission or cloud deployment was qualified.
- OpenAPI version 2.1.0 adds bounded string-list context and documents the enlarged request envelope. Version 2.0.0 replaced the local preproduction boolean/GET contract with tagged POST decisions. Neither is a production-stable external API promise.
- Next: review and land the separate authoring/consumer changes, then agree the bounded operational-management checkpoint and production identity/deployment onboarding. The local connected walkthrough does not establish cloud networking, production authentication or populated-list behavior.

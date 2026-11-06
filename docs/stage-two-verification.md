# Stage 2 verification — local targeting and configuration

Historical evidence: the earlier checkpoint sections below predate the unified redesign. Project-wide metadata, selectable local environments and pinned segment snapshots described there are superseded behavior, retained as history rather than new proof. The appended [unified redesign verification](#unified-redesign-verification) records replacement-specific execution separately.

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

- Flightdeck `pnpm check` passed with zero lint warnings/errors, both typechecks, OpenAPI consistency, provider/standalone/federation/lab builds and formatting. Final `pnpm test` passed **341 tests across nine files**. Real socket/PostgreSQL tests cover operator/service/viewer boundaries, persisted scope isolation, OAuth/response/timeout/size behavior, guarded audience compilation and normal evaluator outcomes.
- The maximum-supported source ID initially produced an invalid overlong generated rule name. Its new regression failed before the display-name-only bound and passed afterward, retaining the full identity predicate. A real-socket prefixed-deployment regression also failed before OAuth/search/resolve preserved the configured BC pathname, then passed after the correction.
- Final cross-repository review found that BC-valid percent-sign local parts and 255-character email addresses were rejected by Flightdeck. Both real-socket search/resolve cases failed with 502 before aligning the HTML5 email validator and 255-character bound, then passed with the complete original address preserved. Regenerated/formatted OpenAPI matches the runtime contract.
- A fresh workspace installed provider Git commit `db0f20c64099065012efa7135248f99459ceb45f` with install scripts disabled and imported the committed compiled entrypoint. A real OpenFeature SDK request returned a live true targeting decision at revision 12. The throwaway workspace was removed after proof; credentials remained private.
- The repaired BC consumer passed 286 focused unit tests, 12 fresh-tenant/membership database cases, backend typecheck/lint/build and changed-file formatting. Its tenant admission now reads current account storage, filters outbound memberships to active tenant-owned targets and omits internal metadata from browser bootstrap. Existing legacy arrays remain unchanged. The pinned provider resolved in the actual host build; Docker/pruned-container execution was not exercised.
- The separate BC directory initially passed 183 focused unit tests. After the final legacy-credential and label-bound corrections, its changed key-policy/lifecycle selection passed 70 tests, the real SQL suite passed eight tests, and the HTTP integration suite passed 55 tests in disposable Testcontainers storage. All three affected package typechecks/lints, the server/dependency build and changed-file formatting passed. Prefix/form parser, legacy key mutation and long-label regressions were observed failing before correction. Live final-build requests also returned 413 for oversized JSON and 415 for form bodies at both directory resolve and credential issuance. Root BC `pnpm fmt:check` failed on untouched inherited files in unrelated packages; no unrelated formatting was changed.
- Through supported BC administration, provisioned a disposable actual tenant, assigned the existing synthetic Mira account, created an organization and pilot group, and persisted both memberships. A tenant-authorized directory-only credential issued with HTTP 201; the existing OAuth endpoint returned Bearer/60 seconds. Actual people partial-email, organization and group searches returned HTTP 200 with only the expected minimal records.
- In the real Flightdeck browser, explicitly prepared the standard catalog fields, selected Mira by partial email, selected the actual organization/group, reviewed and published the three ordinary tenant/source-guarded branches, and enabled only Development. A real BC bootstrap returned true with nonempty organization/group lists and no internal `flightdeck` metadata; the actual homepage title filter was visible.
- Created `bc-demo-pilots` through the project catalog's directory helper and Save. Its three predicates were tenant equality, source equality and `groupIds contains_any ["1"]`. Removed the direct selections, selected only that Flightdeck-owned segment and explicitly published a pinned snapshot at catalog revision 7. BC continued returning true with its actual persisted memberships.
- The committed opt-in connected recording exercised the same authenticated BC account with an empty audience (false and no filter), then selected the real group through Flightdeck's UI, published it and observed true with the real filter visible. Stopping the demo-owned transparent authoring relay—not BC—made searches return 503 and labels unavailable without dropping saved IDs; fresh BC bootstraps remained successful/true. The recorder restored the dedicated flag's original configuration through revision guards and closed its relay. A redundant navigation initially invalidated a response body; removing that navigation produced a successful recording rather than suppressing the assertion.
- Final `FLIGHTDECK_BC_DEMO_CONFIG=.local/bc-directory/demo.json pnpm demo:record` passed all three owned scenarios after the page-model extraction and final builds. It exported the connected clip plus both existing consumer-lab MP4s, proving the separate Sandbox examples still worked. Captions, the unavailable-ID state and the real BC filter were visually inspected in encoded output.
- The connected recording passed again against the final BC lifecycle/label-protected build. Its final MP4 and the two existing consumer recordings were copied to `~/Downloads/flightdeck-stage3-directory/`. Ordinary local Flightdeck was restored to a direct BC connection afterward; an authenticated BFF people search returned HTTP 200 with the real persisted Mira record.

The captioned H.264 clip is ignored at `.local/demos/should-author-a-real-bc-group-and-evaluate-through-an-authoring-outage.mp4`; encoded frames were inspected. Setup and the exact opt-in command are documented in [local development](local-development.md#record-connected-bc-directory-authoring). The scenario refuses Sandbox/unmarked flags, masks the private password, disables traces/screenshots and aggregates primary/restoration failures. Its relay forwards actual BC responses and retains only credential-free method/path counters.

This is a local authoring/evaluation proof using disposable persisted BC records, not production operator identity, shared-network/TLS onboarding, cloud deployment, populated-list filtering or experiment results.

## Limits and next stage

- Flightdeck's evaluation grants constrain tenant scope while the trusted backend asserts context. The separate BC adapter now derives local admission/memberships from fresh BC storage; a production delegation and operator-identity contract is still unqualified. Atlas shell names and Flightdeck's operator picker remain synthetic development identities.
- Rollout and variant decisions are assignment only. No exposure ingestion, metrics, analysis or experiment results are implemented.
- No production issuer, shared-environment authorization, retention/recovery SLA, artifact publication, network admission or cloud deployment was qualified.
- OpenAPI version 2.1.0 adds bounded string-list context and documents the enlarged request envelope. Version 2.0.0 replaced the local preproduction boolean/GET contract with tagged POST decisions. Neither is a production-stable external API promise.
- Next: review and land the separate authoring/consumer changes, then agree the bounded operational-management checkpoint and production identity/deployment onboarding. The local connected walkthrough does not establish cloud networking, production authentication or populated-list behavior.

## Unified redesign verification

Observed locally on 2026-11-05 on `feat/unified-design`; no commit, push or PR was requested for this redesign. The executions below verify the local cutover. Earlier checkpoint records above remain historical and are not relabeled as following-segment evidence.

### Integrated commands and real storage

- `pnpm db:setup` migrated the actual preserved local database successfully.
- Final `pnpm check` passed: lint reported zero warnings/errors; both TypeScript checks, OpenAPI `3.0.0` consistency, provider/standalone/federation/consumer-lab builds and formatting passed.
- Final `pnpm test` passed **353 tests across 10 files**. An earlier run exposed a restricted-role failure from an environment-row `FOR UPDATE` lock. The fix uses the existing runtime-updatable `environment_targeting` row for locking; it did not broaden runtime grants. Scope-deletion fixtures and override checks were also updated for the new foreign keys and environment-local revisions.
- `pnpm demo:seed` passed against the final ready service and preserved existing flags, configurations and the private credential. Its first attempt during a service restart received `ECONNREFUSED`; that was not treated as an application defect.

### Actual standalone, master, viewer and Atlas browser evidence

- Inspected dark/light inventory, flag detail/audience drawer, Segments and Audit trail. A dirty audience draft survived Exceptions refresh. Navigating to Segments prompted Stay/Discard, and Stay preserved the draft.
- Created `unified-ui-smoke-7bd28279` in Development, Off with Development lifecycle; Production detail returned 404. Saving Release retained Off and produced local revision 2.
- A separate local dashboard on port 4752 explicitly initialized the same canonical flag ID in Production with name `Unified production verification`, System lifecycle, revision 1 and gate Off. Development retained Release/revision 2; local cross-environment write returned 403.
- Master on `http://127.0.0.1:4751` rejected an actual PATCH with 403 and identical before/after state. Its UI exposed no edit/gate/create actions; the missing Production report was Unavailable until Production's own explicit creation. These were actual local database reports, not remote deployment transport.
- Master reported-lifecycle filtering matched the System report while retaining the same flag's distinct Development Release report. Selecting Permissions returned no matching flags rather than broadening the query or inventing a report.
- Viewer inspected the full advanced configuration read-only and evaluated published context: the result selected the control rule at flag revision 15 / publication-time catalog revision 4. No edit/create controls were available.
- The unmodified Atlas shell on port 4720 loaded all three registered views, supported the embedded Create flag dialog, showed one project control and did not include standalone chrome.
- At 900px width the browser exposed a duplicated menu. The wrapper selector was corrected; final browser inspection showed the duplicate hidden, section navigation visible and no horizontal overflow (document width 900px, app width 840px).

### Assertion-backed recordings

All four recordings passed and were copied to `~/Downloads/flightdeck-unified-design/`. Generated/private artifacts remain outside Git.

- The two existing consumer-lab scenarios passed in 57.7s and 43s.
- The connected BC directory scenario and new unified scenario passed in approximately 1.1m and 2.0m, with H.264 1440×1000 exports. The unified video encoded to 123 seconds; captioned contact-sheet frames were inspected.
- The unified scenario proved saved drafts non-live; segment publication v2 changed an actual SDK result to true without changing flag revision, gate or authored configuration inputs. History inspection changed nothing. Restoring historical v1 produced non-live draft v3 while published v2 continued returning true. Audit inspection showed exact affected references and retained historical events.
- Recorder failures were investigated and corrected: typed fetch response/envelope handling, awaiting filtered rows, restoration comparisons against authored configuration instead of obsolete catalog metadata, scoped locators and duplicated ARIA status handling. Assertions were not suppressed to obtain passing recordings.

After closing the recording relay, the ordinary direct connection was also exercised in a real browser: Alex login/setup reload → BC flag → Edit audience → shared search `flightdeck`. The grouped picker simultaneously displayed actual Mira Demo, Flightdeck Demo Operations organization and Flightdeck Demo Pilots group results. No selections changed, no unpublished changes appeared, and the editor closed without mutation. A dark-theme screenshot was captured; this narrow check was not a video. No relay remained running.

### Limits and remaining gates

Ordinary Flightdeck directory lookup was configured directly to BC port 4741, without the recording relay as a runtime dependency. The ready local services were standalone 4721, Atlas 4720, consumer lab 4722, master `127.0.0.1:4751` and Production-local `127.0.0.1:4752`. An unrelated service bound through localhost IPv6 was left untouched. One standalone diagnostic reported `DELETE session` `ERR_ABORTED` during deliberate logout despite the completed viewer transition. Master browser checks reported no errors; embedded checks were not pristine across service interruption, as described below.

During a deliberate Flightdeck stop/restart to restore direct directory configuration, the unmodified Atlas shell temporarily omitted Flightdeck from its periodically fetched manifest (the shell service logged a fetch failure). The already-open embedded page then crashed in shell asset `index-Dt…`, where the inspected minified `Ce`/`Q` path assumed the current app manifest entry existed and read `undefined.id`. Once Flightdeck was ready, the manifest returned HTTP 200 with `apps: [flightdeck]` and `unavailable: []`; reloading the embedded URL recovered the local dashboard. Steady-state three-view, creation and theme evidence remains valid, but this exposed an external shell transient-availability/reload limitation. No Atlas files were changed, no Flightdeck fix for that shell failure is claimed, and this is not hosted-resilience qualification.

These observations do not prove cloud deployment, production identity, remote-report transport, hosted CI, hosted Spud review, SDK delivery latency, real exposure or experiment results. The separate BC adapter/API remains a separate change. The user-owned untracked work-package document and private credentials were not modified.

### Dedicated creation screens

The later creation-flow refinement replaces the Create flag/segment dialogs shown in the earlier redesign evidence. Existing-draft editing and short discard/publication confirmations remain dialogs.

- Actual standalone inspection showed full-page flag and segment forms with the project and fixed Development context visible, with no creation dialog. Both dark and light surfaces were inspected; the light segment screen at 900px had a 900px document width, with no horizontal overflow.
- Back/Cancel on dirty flag and segment forms opened discard confirmation. Cancelling preserved the entered name. Cross-view flag navigation and a segment project change opened the shared navigation guard; Stay preserved the input. Confirmed discard returned to the appropriate inventory/library.
- The unmodified Atlas shell loaded both dedicated creation screens through the federated Flags view. Browser inspection found `data-embedded=true`, one project control and no creation dialog; screenshots confirmed shell-owned chrome remained intact.
- A repeated Create segment action exposed a retained-editor bug: explicit Discard and leave kept the old name. The transition now initializes a new editor, and the owned unified recording covers Stay preserving the name followed by discard clearing it.
- After that correction, the actual browser showed a blank new segment name after confirmed discard, and clean Back returned directly to the library. A real duplicate flag-key save was rejected; name/key/owner inputs remained intact and the submit control became available again. No duplicate record was created.
- Final `pnpm check` passed lint (zero warnings/errors), both typechecks, API-contract consistency, all builds and formatting. `pnpm test` passed **353 tests across 10 files**.
- The final opt-in unified Playwright recording passed in 2.5 minutes against the final build. It created the flag through the full-page UI, asserted its initial Off state, created a non-live segment draft through the dedicated screen, exercised Stay/discard/reset, then completed the existing publication/following/history/restore and real evaluator assertions. The exported H.264 1440×1000 MP4 is 149 seconds; encoded captioned frames were inspected and the refreshed clip was copied to `~/Downloads/flightdeck-unified-design/`.

### Lifecycle cards and name-derived keys

- Matched the creation mockup's large Development/Release delivery cards and System/Permissions long-lived cards, retaining Name, Flag key, Owner and Description. Actual dark/light inspection showed 96px-high selectable cards; the 900px layout retained both groups side by side, and the 600px layout stacked them without horizontal overflow.
- Actual browser input `New Workspace Navigation` generated `new_workspace_navigation`. Further checks covered repeated spaces/punctuation, lowercase conversion, the 100-character key limit and a name with no usable letter. Clearing the untouched name also cleared the generated key and allowed clean Back navigation without a false dirty warning.
- A manually entered `custom_planning_key` survived a subsequent Name edit. ArrowRight selected Release from Development and exposed a visible solid focus outline. Editing an existing flag's Name left its key read-only and unchanged; the edit was cancelled without saving.
- `pnpm check` passed lint (zero warnings/errors), both typechecks, contract consistency, all builds and formatting; `pnpm test` passed **353 tests across 10 files**.
- The updated unified recording passed in 2.6 minutes. Browser assertions proved the generated key and manual-override preservation; clicking the System card created a real persisted System flag that still started Off, retaining the supplied owner and description. The existing draft/publication/evaluation/history workflow also passed. Encoded captioned frames were inspected; the 155-second MP4 replaced the previous clip in `~/Downloads/flightdeck-unified-design/`, with matching SHA-256 hashes.

### Flag detail blocks

- Matched the mockup's compact full-width Lifecycle block and Published behavior block, with Audience beside Test a context on desktop. Actual dark/light browser inspection showed the corresponding lifecycle/gate/audience/exception actions inside their blocks. Metadata, advanced read-only inspection, audit and the guarded audience drawer remain reachable.
- At 900px the audience/context pair stacked; at 600px the document stayed 600px wide and the 540px detail surface had no internal horizontal overflow. Opening the audience editor stacks the pair within the published column.
- Against `simple-targeting-mw38e63c`, a real operator preview returned HTTP 200 / Boolean false / reason default for a basic/east context. Selecting Everyone in an unsaved audience draft, opening Exceptions and evaluating again still returned the published false decision. The context and draft selection survived those interactions.
- Change lifecycle prompted the existing dirty-draft guard; Stay retained Everyone. Confirmed discard closed the drawer and preserved the context text. Gate and lifecycle review dialogs named Development and expected r8; both were cancelled without changing the flag.
- Vera's viewer detail displayed all four blocks, exposed no lifecycle/gate/audience/metadata/archive mutation buttons and successfully previewed the same context with HTTP 200 / false. Deliberate logout still recorded the previously observed `DELETE session` `ERR_ABORTED` diagnostic despite the completed identity transition; this UI refinement does not claim to fix that diagnostic.
- Final `pnpm check` passed lint with zero warnings/errors, both typechecks, OpenAPI consistency, all builds and formatting. `pnpm test` passed **353 tests across 10 files**.
- The unmodified Atlas shell displayed the same four blocks through the federated Flags view, with Audience and Test a context sharing the same desktop row. Inspection found `data-embedded=true`, one project selector and no browser diagnostics in that embedded tab. Shell chrome remained shell-owned.
- The existing unified Playwright recording passed against the final detail layout in 2.6 minutes, including audience publication, real context preview, SDK evaluation and segment history/restore assertions. Encoded overview and open-drawer frames were inspected. The 155-second H.264 clip was copied to `~/Downloads/flightdeck-unified-design/`; source and Downloads SHA-256 hashes matched.

### Inline audience editing and modal publication review

This later refinement supersedes the drawer-specific layout and review steps in the earlier evidence above.

- Actual standalone and Atlas inspection showed Edit audience expanding inside the Audience card, with no complementary drawer. Advanced controls was outside Audience, below the Audience/Test a context pair and closed initially. Both surfaces retain one shared draft and remain mounted.
- The draft row placed Discard at x362 and Review at x848 on the same desktop row. Dark/light review dialogs showed current/proposed audiences, exact JSON, scope, unchanged gate/lifecycle and allocation warnings. At 600px the dialog measured 568px wide with equal client/scroll widths (no horizontal overflow). Cancel and Escape retained the draft and the published-context input; the exact persisted `simple-targeting-mw38e63c` flag remained unchanged.
- Reviewing unchanged authored input explicitly said so and warned that Publish still records a configuration revision/catalog refresh. A real published-context preview still returned HTTP 200 / false while the unsaved audience was Everyone.
- The advanced simulation context survived disclosure and editor-close/reopen transitions. Invalid JSON in a subsequently collapsed Advanced field blocked review, reopened Advanced and displayed feedback outside it; no review dialog opened. Discard reset invalid draft fields while retaining both advanced and published test contexts.
- Viewer inspection showed disabled configuration fields and no visible Edit audience, Discard, Review or Publish actions. Advanced published simulation returned HTTP 200 / false with no proposed decision or publication dialog.
- The connected BC recording was attempted but stopped before authoring at its fixture safety guard. A read confirmed its dedicated marked/simple/unarchived flag was Off, with the expected owner and marker. The saved gate was not activated to bypass the guard, so the connected publish/outage replay is not requalified by this pass.
- Restored ordinary Flightdeck to the direct BC connection. A real browser search returned the persisted person, organization and group through the inline picker; a nonpublishing review explicitly retained Gate Off. Cancel/close left the exact BC fixture unchanged. No recording relay remains required for ordinary use.
- Final `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, all builds and formatting; `pnpm test` passed **353 tests across 10 files**.
- The updated unified recording passed after the final pacing/assertion changes in 2.8 minutes. It proved server-validated review → Cancel with exact persisted flag equality and retained selection → reopened modal → explicit Publish, with gate/lifecycle unchanged, followed by real context/SDK evaluation and segment history/restore. Encoded inline/action-row and final review-modal frames were inspected. The 166.6-second H.264 clip replaced the unified video in `~/Downloads/flightdeck-unified-design/`, with matching SHA-256 hashes; the older BC outage clip is not new proof for this refinement.

### Full-width Audience and consistent membership search

- At 1440px, actual standalone Audience and Test a context cards were each 1092px wide and aligned, with context below Audience rather than beside it. At 900px the light layout retained equal full widths, stacked order and a 900px document width.
- Flag membership editing used the same compact inline picker as Create segment, without Add people, Search directory or Done steps. Typing the live `flightdeck` query automatically returned HTTP 200 for people, organizations and groups. A one-character query displayed the directory's minimum-length guidance.
- Actual live selection checks covered type filtering, query clearing, removal/undo and three retained chips with person/organization/group counts. Review preserved Gate Off; cancelling and discarding retained the published-context input and left the exact stored BC flag unchanged.
- A deterministic browser transport check held three real older-query requests, completed a newer real directory search, then released the older requests. No responses were fabricated. The newer query/results and all three selected targets remained intact after the late replies.
- Create segment still searched its existing separate POC fixtures, and clearing the query retained its selected person/group chips. The unsaved segment was discarded. A disconnected Sandbox flag showed the explicit connection notice with no search input or substituted demo results.
- `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, all builds and formatting. `pnpm test` passed **353 tests across 10 files**. The BC recording page model was migrated to automatic search; its enabled-fixture publish/outage replay was not rerun or represented as new proof while the saved BC gate remains Off.
- The unmodified Atlas shell also rendered equal full-width Audience/context rows and the compact inline live search. Typing returned the real BC group without reveal/submit controls; Advanced remained collapsed, and the search-only session closed without a targeting change.
- The refreshed unified recording passed in 2.8 minutes and exported a 166.1-second H.264 MP4. Its encoded Audience/context frame was inspected, and the copy in `~/Downloads/flightdeck-unified-design/` has the same SHA-256 as the generated file. The first run passed the scenario but failed export because no video attachment was available; rerunning with an isolated Playwright output directory produced the recording successfully. The cause of the first missing attachment was not established. This Sandbox recording proves the unified publication/context workflow; real BC directory search was separately exercised in the browser above.

### Unified audience search

- One actual standalone `demo` query returned real BC person, organization and group results alongside the published BC demo segment. The Segments filter showed only segment results; segment key lookup (`west-region`, `stage-two-enterprise`) worked without a separate add/select flow.
- A mixed selection retained seven targets: one person, one organization, one group and four segments. Clearing search preserved all targets. The six-chip preview expanded to seven, local selected-target filtering found the correct segment, and removal/undo restored it. A subsequent different selection invalidated the prior removal undo.
- Browser transport interception deliberately failed directory search requests without fabricating responses. Each directory result group showed its own lookup failure while the matching Flightdeck segment remained selectable and all seven targets remained selected. Interception was removed afterward.
- In disconnected Sandbox, segment search and selection remained available with the explicit BC connection notice and no directory fixture fallback. An actual draft-only segment named Inline screen verification did not appear as a selectable result. Light-theme inspection at 900px showed a 900px document width with no horizontal overflow.
- Mixed-audience review showed current/proposed segments and guarded directory branches with Gate Off and lifecycle unchanged. Cancel preserved all seven selections and the published test-context input; Discard restored saved targeting. Exact before/after HTTP flag objects were equal at revision 34, still Off. No BC flag publication was performed.
- The independently built remote loaded in the unmodified Atlas shell. Its unified query returned all four typed result groups, and the obsolete + Segment button was absent. The search-only Atlas session closed without authoring changes.
- Final `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, standalone/federation/consumer builds and formatting. `pnpm test` passed **353 tests across 10 files**. The updated unified Playwright scenario passed in 2.8 minutes through segment search/selection, cancel/review/publication, context/SDK evaluation and segment history/restore. The BC publish/outage recording was not rerun; its page model was updated for the unified search and selection labels.
- The new 168.9-second captioned H.264 recording exported successfully. Its encoded unified-search frame was inspected, and the refreshed copy in `~/Downloads/flightdeck-unified-design/` matched the generated MP4's SHA-256. Generated recordings remain ignored.

### Full-width collapsible inventory lifecycle groups

- Separated inventory heading styles from the create form's lifecycle cards. At a 1440px standalone viewport, every present group header and its clickable control measured the full 1066px table width, with native table-row layout. Development, Release and System initially exposed all 14 flags (11/1/2 respectively).
- Clicking Development hid exactly its 11 flag rows and left the Release/System headings and three flags visible. Enter reopened it; Space collapsed it again with focus retained. Independently collapsing all groups left their headers visible with zero flag rows; reopening Release showed its one row. Group by None showed all 14 rows, and returning to lifecycle grouping retained the current view's individual collapse choices.
- Searching for `bc-homepage-title-filter` retained its collapsed Development header and the correct one-result pagination count; expanding it exposed the flag. Opening flag detail and returning to a fresh inventory reset all groups to expanded. The create screen still rendered four lifecycle cards in two grid groups; no flag was created.
- At 900px in light theme, all lifecycle headers spanned the 766px table and document width stayed 900px. Dark/light screenshots were inspected. The unmodified Atlas shell rendered full-width 1306px headings, initially open; collapsing Development again retained only the three other flags.
- The exact before/after HTTP inventory response was unchanged. No flag metadata, lifecycle, gate or configuration writes were made. Final `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, all builds and formatting; Vite reported its non-failing 500-kB chunk-size advisory. `pnpm test` passed **353 tests across 10 files**. This pass used actual browser smoke rather than a new permanent test or refreshed recording.

### Lifecycle filtering expands the selected group

- After collapsing Development and System in the actual standalone inventory, selecting the Development tab reopened all 11 matching flags. Returning to All flags retained Development as open and System as collapsed; other groups were not reset.
- Selecting System reopened it. Manually collapsing it while filtered and reselecting the same System tab reopened its two flags again. The actual filtered table was visually inspected; no flag state was written.
- `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, all builds and formatting, with the existing non-failing Vite chunk-size advisory. `pnpm test` passed **353 tests across 10 files**. This refinement was exercised in the standalone browser; the shared federation build passed, without a separate Atlas browser replay.

### Whole-row audit opening and compact event navigation

- Actual pointer clicks on a full history row's date, object cell and empty scope-cell padding opened that row's event. Actor-cell opening was also exercised inside the unmodified Atlas shell. The native event control opened with both Enter and Space.
- At 1440px standalone, selection replaced the full table with 20 compact event controls in a 288px list beside a 762px detail pane. Rows displayed short UTC date/time, action and recorded flag/segment name. The chosen date read `06 Nov · 17:51 UTC`, while detail retained `2026-11-06 17:51:35.817 UTC`. Switching to a flag event updated its identity and maintained one current selection; focus moved to the event heading.
- Close restored the full table and focused the selected event button. A Page 2 open/close cycle retained the exact 20 event IDs and page number. A separate search/object/action-filter cycle retained all filter inputs and the exact filtered IDs after close. Applying a no-match query while detail was open removed both the stale detail and compact list; Reset restored full history.
- At 900px in light theme, the layout used one 766px column, with the list bounded to 288px height above detail and scrollable through its 20 events; document width remained 900px. Dark/light viewport screenshots were inspected. Atlas used the same 288px compact list beside 1002px detail, then restored the full table and focus on close.
- Rereading the initially inspected event through the scoped audit API returned an exactly equal event object. The browser smoke performed no configuration/history writes. The separate unified recording used only its guarded owned Sandbox fixtures for publication and restoration.
- `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, all builds and formatting, with the existing non-failing Vite chunk-size advisory. `pnpm test` passed **353 tests across 10 files**. The updated unified Playwright scenario passed in 2.8 minutes, including whole-row opening, compact selection/switching and full-table/focus restoration, as well as its real publication, SDK and restore assertions.
- The successful captioned H.264 export is 169.2 seconds. Its compact audit scene was inspected in the encoded video; the refreshed unified clip in `~/Downloads/flightdeck-unified-design/` has the same SHA-256 as the generated file. Earlier BC outage recordings were not rerun or represented as new proof.

### Grouped audit detail containers

- The actual standalone detail rendered separate bordered cards for summary/metadata, before/after and the historical-snapshot notice/object action. Publication events with a recorded affected-reference field added a fourth impact card; an undefined field did not create an empty placeholder.
- Exercised real flag-configuration, segment-draft, publication-with-two-references and publication-with-an-explicit-empty-reference-set events. Every card measured 762px wide at a 1440px viewport, with 16px separation and a visible border. Nonempty impact retained its two recorded flag rows; the empty impact retained its explicit no-reference message.
- Opened Full recorded snapshots for each variant and parsed both displayed JSON values. Each pair exactly matched the event's original previous/next values read from the scoped audit API. No configuration or history write was performed.
- Dark-theme summary, changes, impact and boundary containers were visually inspected. At 600px in light theme, all four cards measured 466px, metadata became one 432px column and document width remained 600px. The compact list remained available; Close restored full history and focus to the selected event.
- `pnpm check` passed lint with zero warnings/errors, both typechecks, contract consistency, all builds and formatting, with the existing non-failing Vite chunk-size advisory. `pnpm test` passed **353 tests across 10 files**. This presentation-only refinement used real standalone browser smoke; federation built successfully, but no separate Atlas replay, new permanent test or refreshed recording was performed. The preceding recording remains evidence for the earlier compact-navigation pass, not these new containers.

### Release preparation: followed data and schema-save safety

- Reproduced publication failure with all 32 custom catalog attributes plus a direct directory person predicate, and migrated-flag read failure when complete followed type descriptions expanded beyond the old aggregate 64-KiB check. Regression scenarios now preserve the catalog, exact captured segment bindings, old event snapshots and flag revisions while exercising matching/nonmatching evaluation.
- Separate native Node runtime smoke accepted 95,940 bytes of resolved followed data with only 661 bytes of flag-owned configuration. Actual admitted/excluded decisions returned true/rule and false/default with 16/17 trace entries and 1,966/1,969-byte responses. No description or operand was trimmed. Independent regression cases reject both excessive trace count and a below-1500-entry trace exceeding the 192-KiB allowance.
- Actual browser transport interception held a schema PUT before forwarding: before the fix the textarea stayed editable; afterward it was disabled while pending. Aborting the held request re-enabled editing and retained the draft; Discard restored the original. No schema write reached the service.
- Captured fresh light/dark PNGs of the actual local flag inventory, lifecycle groups, flag detail, unified audience search, segment library/definition and grouped audit/impact views in `~/Downloads/flightdeck-unified-design/screenshots/`. These are presentation evidence, not production deployment or BC publish/outage replay.
- Release `pnpm check` passed lint with zero warnings/errors, both typechecks, runtime/OpenAPI consistency, provider/standalone/federation/consumer builds and formatting. `pnpm test` passed **358 tests across 10 files**. The existing non-failing Vite chunk-size advisory remains.

### Library-owned creation actions

- Actual standalone inspection showed no sidebar creation shortcuts and one header action group containing Create flag / Reload flags. Create segment remains in the segment library. The compact navigation also contains no creation actions.
- Opened flag creation from its library header, retained an edited Name when cancelling discard, explicitly discarded it and reopened an empty form. Opened segment creation from its library and returned through Back to segments without saving.
- At 600px in light theme, both flag header actions remained on screen and the document width stayed 600px. Desktop dark and narrow light layouts were visually inspected. Viewer inspection exposed neither flag nor segment creation actions.
- The independently built remote rendered the same action group inside the unmodified Atlas shell (`data-embedded=true`), with no other creation buttons on the inventory surface. Create / Back / Reload worked in the embedded Flags view.
- Updated the captioned demo's segment discard workflow to use Back to segments, Cancel and explicit Discard, then reopen creation through the library. Removed its obsolete confirmation-wording assertion; the scenario still checks retained versus discarded draft contents.
- The revised captioned unified Playwright scenario passed in 2.9 minutes and exported its MP4, including library creation, Cancel/discard/reopen, real publication/evaluation and history restore-as-draft.

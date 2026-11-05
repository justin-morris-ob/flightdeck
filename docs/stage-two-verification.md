# Stage 2 verification — local targeting and configuration

This records observed local execution, not a production certification. Stages 0–2 are implemented; BC integration, verified production identity, shared deployment and experiment measurement remain later gates.

## Environment and commands

Used Node `26.12.1`, pnpm `11.23.0`, dedicated PostgreSQL 17 Compose storage and the existing compatible published Atlas/UX Kit `0.1.0` package set. No dependencies were added in this stage. Flightdeck ran at `http://localhost:4721`; a separately configured, unmodified Atlas checkout ran at `http://localhost:4720`.

Executed:

- `pnpm db:setup`: applied `002-targeting.sql` to existing application/test databases without resetting application storage.
- `pnpm fmt`: completed successfully with BC-derived Oxfmt.
- `pnpm check`: Oxlint reported zero warnings/errors; frontend and native-server typechecks passed; generated OpenAPI matched runtime schemas; standalone and federation builds passed; formatting check passed.
- `pnpm test`: **109 tests passed across four files** after integration fixes. The final full run followed the UI layout correction and consumer/contract integration.
- Separate native-Node HTTP smoke script: exited successfully after the persisted/API scenarios below. The temporary ignored script/result were removed after verification.
- Separate `pnpm consumer` processes: observed real service decisions with tagged string and JSON values, rule/variant IDs, revisions and deterministic traces.

No hosted CI run, new cloud deployment, container execution or Stage 2 frozen reinstall is claimed. Stage 1 records the original lockfile installation proof.

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

## Limits and next stage

- Credential tenant grants constrain evaluation but do not verify BC user/account membership. Traits are asserted by the trusted caller. The operator picker and Atlas shell names remain synthetic development identities.
- Rollout and variant decisions are assignment only. No exposure ingestion, metrics, analysis or experiment results are implemented.
- No production issuer, shared-environment authorization, retention/recovery SLA, artifact publication, network admission or cloud deployment was qualified.
- OpenAPI version 2.0.0 replaces the local preproduction boolean/GET contract with tagged values and POST context. All repository consumers were migrated; this is not an external stable API compatibility promise.
- Next: Stage 3 must establish authoritative BC subject/tenant context, connect an actual backend-owned BC feature path, and demonstrate bounded fallback, revocation/outage/stale-data behavior through that consumer. Network reachability alone is insufficient.

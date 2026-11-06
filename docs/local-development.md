# Local Flightdeck development

## Prerequisites

- Node `26.12.1`, pnpm `11.23.0`, Docker with Compose and approved Nexus read access.
- Route `@onebrief` through the committed `.npmrc`. Keep URL-scoped Nexus credentials in your private user configuration, never in this repository.
- Local ports: Flightdeck `4721`, consumer lab `4722`, optional Atlas shell `4720`, PostgreSQL `55471`.

Flightdeck is intentionally a loopback-only development application using synthetic identities and data. `Production (local simulation)` is an environment label, not a deployed production environment. Do not put organizational/customer data in this instance.

## Install, initialize and run

With the pinned Node active:

```sh
pnpm install --frozen-lockfile
pnpm db:setup
pnpm build
pnpm start
```

Open **http://localhost:4721**. Select a synthetic development operator to start a signed, HttpOnly local session. That picker is a deliberate development facility, not a production login protocol.

Without a globally active Node, use `mise trust`, `mise install`, then prefix commands with `mise exec --`. pnpm honors the package-manager version in `package.json`.

The backend serves both built browser assets and the API; `pnpm dev` currently starts that same built application. After changing frontend code, run `pnpm build` and reload. Backend changes require a restart. There is no separate Vite/backend two-port development workflow.

### Local roles

| Operator      | Permission                                                    | Organization                |
| ------------- | ------------------------------------------------------------- | --------------------------- |
| Alex Morgan   | Administrator: flag changes and scoped credential management  | Flightdeck development      |
| Ellis Chen    | Editor: flag changes, no credential management                | Flightdeck development      |
| Vera Singh    | Viewer: inventory, activity and evaluation preview, no writes | Flightdeck development      |
| Jordan Rivera | Administrator of the isolated test organization only          | Isolation test organization |

These identities are fixed server-owned fixtures. The browser cannot choose its role or organization by posting those values. Selecting another development operator deliberately switches identity. Atlas's independently selected demo name does not establish Flightdeck authorization.

The bootstrap organization has Flightdeck and Sandbox projects, with development and historical simulated production records. The default dashboard manages Development only. An immutable project key can be reported across environments, but creation starts Off only locally; metadata, archive state, lifecycle and revisions are environment-local. Archived flags retain configuration and return the typed off value with reason `archived`. Unknown keys are errors, not successful false decisions.

### Deployment role and navigation

The three primary views are **Flags**, **Segments** and **Audit trail**, with project context and secondary settings. Local inventory shows gates, audiences and lifecycle, not a comparison matrix or environment selector. Master shows read-only reports from this database; it does not discover remote deployments or invent unavailable state.

The local flag list defaults to lifecycle grouping with every present group expanded. Full-width Development, Release, System and Permissions headings toggle their own rows by click, Enter or Space, with accessible expanded state and row associations. Other groups remain visible. Collapse choices stay within the current inventory instance across text search and grouping changes; selecting or reselecting a lifecycle tab automatically expands that lifecycle without resetting other groups. Opening a fresh inventory starts expanded again. **Group by · None** shows all returned rows. This is presentation only: the 20-row page, filtering, flag state and master comparison remain unchanged.

Server startup configuration (read by `server/deployment.ts`, exposed through `GET /api/v1/deployment`):

| Variable                      | Default and meaning                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `FLIGHTDECK_DASHBOARD_MODE`   | `local`; accepts `local` or `master`. Master rejects operator mutations at the server boundary.                                        |
| `FLIGHTDECK_ENVIRONMENT_KEY`  | `development`; writable environment identity for a local dashboard.                                                                    |
| `FLIGHTDECK_ENVIRONMENT_NAME` | `Development`; visible deployment label, not a selector.                                                                               |
| `FLIGHTDECK_DASHBOARD_LINKS`  | `{}`; JSON object mapping environment keys to dashboard URLs. HTTPS except loopback HTTP; no URL credentials; at most 20 destinations. |

These are distinct from `FLIGHTDECK_MODE=local-development`, which guards this synthetic loopback runtime. Master does not enable production hosting. Browser requests cannot override deployment authority. Changing another environment requires its configured local dashboard and authorization; handoff links grant no rights. Missing configuration is Unavailable, never Off.

### Author targeting and configuration

Creation actions live with their libraries, not above the navigation views. Open **Flags** and use **Create flag** beside **Reload flags** in the library header, or open **Segments** and use **Create segment** beside **Reload segments**. Creation remains unavailable to viewers and on master dashboards. Both creation screens preserve project/environment context and require confirmation before discarding unsaved edits.

1. Inspect local published behavior, gate, typed outcomes and lifecycle. **Edit audience** opens an unpublished draft; audience changes do not activate the gate.
2. Compatible Boolean flags offer **Everyone** or **Selected audiences**. Segments and direct people/memberships are OR alternatives; empty selection means nobody. Exceptions retain priority below archive/Off gates.
3. Use the single audience search for **People**, **Organizations**, **Groups** or **Segments**, with All/type filters, grouped results and shared selection chips. Published Flightdeck segments match locally by name/key even when the BC directory is disconnected or failing; draft-only segments are not selectable. BC results require the private connection and at least two characters; configured is not healthy, and lookup errors remain explicit. Stable IDs, including stale selections, survive search clearing and removal/undo. Each direct branch retains tenant/source guards; selected segments follow current publication. No separate + Segment flow or nested-segment authoring is introduced.
4. Review before/after and publish explicitly to the named local environment. Empty-context validation is not real-user simulation or an audience-size estimate.
5. Advanced typed values, conditions, rollouts, variants, overrides and context testing remain available; complex configurations are preserved rather than converted lossily. Published-context testing performs no directory lookup.
6. Review/save Development, Release, System or Permissions as local lifecycle metadata, independently of publication/gates. No other environment changes or automatic transition/cleanup is implied.
7. Exceptions require exact tenant/subject, owner, reason and future expiry. Revoke explicitly; expiry equality is already expired.

For the temporary POC, the segment builder's **1 · People & memberships** block immediately exposes the search field. Type a name, email, organization or group to find the three synthetic records of each kind. Fixtures remain clearly marked in `src/demoDirectory.ts`; the screen intentionally has no directory-source switch, demo banner or demo labels on selected targets. Search results filter locally and scroll within the picker; selections remain visible when search is cleared. Saved fixture predicates retain source `flightdeck-synthetic-demo` and a separate synthetic tenant, not real BC memberships. Flag audience editing still uses its live connection.

### Segment drafts, publication and history

**Segments** owns reusable local audiences independently of a flag editor. Create/save a draft from people/memberships and/or traits. ANY definition block may match; ALL conditions inside a block must match. `ends_with` is exact case-sensitive text suffix matching; missing/wrong-type traits do not match. Effective memberships follow a person across organizations, not only the active organization.

The segment library groups search, usage filtering, table rows, empty results and explanatory text inside one bordered card. Segment names and referenced flag names use the same unboxed link-style navigation as the flag inventory, with hover/focus underlining and keyboard activation; their navigation destinations are unchanged. Multiple referenced flags appear as a spaced list, and wide tables scroll inside the card on narrow screens.

Each row previews at most three referenced flags. When more exist, **View all N flags** opens that segment's **Where used** tab with the complete reference list; no references are discarded. Returning through **All segments** preserves the library search.

The creation form follows the unified mockup: Name and Description share a row, the immutable key remains available, and bordered numbered People & memberships / Trait rules blocks are separated by OR. **2 · Trait rules** is visible even before adding a condition; leaving it unused adds no implicit predicate. Add AND conditions within a trait block or deliberate additional OR blocks. Narrow layouts stack metadata and wrap controls without changing matching or draft/publication semantics.

Selected targets use distinct person, organization and group icons, compact named chips and total/per-kind counts. Up to six chips are shown initially; **+N more · View all** opens a height-limited, scrollable list with **Filter selected targets** search by name, email, type or saved ID. Removal and undo operate on the actual selection, not only the visible preview; long names retain their full details in accessible labels/tooltips. Missing labels and saved directory-source markers remain explicit.

Segment membership selections are partitioned into the existing 20-ID guarded OR blocks, so hundreds of targets can be retained without increasing predicate limits. The shared 20-block segment budget includes traits and all membership kinds/sources (at most 400 IDs if all blocks are memberships); selecting a target that needs another block is disabled when that budget is full. Draft/payload validation remains authoritative. Direct flag audience editing retains its existing single 20-ID batch per kind.

An existing segment opens with one **Segment overview** card containing its inspected name/description, immutable key, explicit version state, concise audience/trait contents and publication boundary. Published, saved draft and historical contents stay distinct; inspecting a draft does not change the published version followed by flags. Counts describe selected targets and stored conditions, not a population estimate.

The page header groups **All segments** (a back-arrow navigation action) with **Create segment** and **Reload segments**, separated visually from the library actions instead of placing a second navigation row below the header. All segments appears only inside a segment; creation retains its focused **Back to segments** action.

**Definition**, **Where used** and **Version history** form a content tab bar with linked tab panels and Arrow Left/Right, Home and End keyboard navigation. Definition gives people/memberships and each trait block a full-width section below the overview, consolidating guarded membership batches into one compact audience view without changing OR/AND semantics. Where used owns the published-reference table; Version history retains inspection, older-version paging and guarded draft restore. Leaving a historical inspection for Definition/Where used returns to current publication (or the saved draft when nothing is published). Viewer inspection exposes no unpublished definition or mutation controls.

Each tab's content is enclosed in a padded, bordered card matching the overview card, so its heading, tables and definition blocks share a visible container. Inactive tab cards remain hidden.

The **Audience and trait rules** heading repeats the inspected definition's version in a compact badge: **Published vN** or **Draft vN · Not live**. It changes with the version selected in the overview, keeping the lower definition visibly tied to that snapshot. Historical contents retain their explicit **Historical vN · Read only · Not active** heading.

Saving/restoring a draft changes nothing live. Inspect current publication and actual published where-used references, review before/after and exact impact, then publish explicitly. Publication atomically advances every published local reference, including Off flags, without republishing flags or changing flag revisions, gates, direct selections or unrelated drafts. Off still returns its typed off value. Browser-only flag drafts are not persisted usage/impact records.

Flag names in the review's **Affected published references** table and the **Where used** table use unboxed navigation-link styling, matching the segment library. Hover and keyboard focus underline the name; activating it opens that flag without publishing the segment or discarding its saved draft.

Publication clears the draft and retains historical snapshots. Guarded restore copies historical contents into a draft after explicit replacement confirmation, never directly into live state. Separate review/publication is required. Concurrent reference changes invalidate stale publication review.

Segment records include the latest 20 retained definitions in `history` plus `historyNextCursor`. Load older versions through `GET /api/v1/projects/{projectId}/environments/{environmentId}/segments/{segmentId}/history?before=<version>&limit=20`; the response contains `items` and `nextCursor`. **Load older** pages the retained history rather than truncating retention to the initial display.

Flag publication attaches following references to current published segments, not per-flag version pins. Validated attribute definitions remain in published snapshots. Catalog edits alone do not publish flags or segment drafts. Changing allocation IDs/weights/order may reassign subjects; names are not allocation IDs. See the [evaluation specification](evaluation-spec.md).

**Audit trail** is bounded scoped searchable/filterable history with immutable event-time before/after, including historical pins and exact segment impact. Segment audit state preserves the recorded current published definition, draft and usage but omits accumulated history/page fields to avoid repeatedly storing the entire version archive. Retained historical definitions are read separately through segment history. Audit is not SDK delivery, exposure or population telemetry.

Click anywhere in an audit event row to inspect it, or focus its event button and press Enter/Space. Opening an event replaces the full results table with a compact scrollable list showing day/month, minute-level UTC time, action and recorded flag/segment name. The selected event is marked, and another list item switches the detail without returning to the full table. Full timestamps remain in the accessible event label, date tooltip and detail; shortened text does not alter event-time data. Actor, request scope, identities, exact before/after snapshots and affected published references stay in the read-only detail. **Close event** restores the same filtered page and focuses that event's full-row control. Applying filters, paging or refreshing clears the old selection; narrow layouts stack the compact list above detail.

Limits: 32 custom context definitions, 50 segments, 20 rules, 10 conditions per rule/block, 20 blocks per segment, 5 segment references per rule and 10 variants. Segment/configuration drafts are bounded to 24 KiB; flag-owned published configuration (excluding separately owned following segment definitions) to 64 KiB; individual JSON values to 4 KiB. Resolved segments retain complete captured type definitions and operands. Publication independently bounds the worst-case configuration trace to 1500 entries / 192 KiB, reserving headroom within the consumer's 2000-entry / 256-KiB response limits; descriptions and operands do not consume trace budget. Context is bounded to 32 KiB and lists to 100 entries of 500 characters each. HTTP envelopes are bounded to 64 KiB. Arbitrary nested traits are unsupported. [Unified verification](stage-two-verification.md#unified-redesign-verification) records actual integrated local evidence, separately from historical checkpoints and production gates.

### Optional BC directory authoring connection

BC owns accounts, organizations, groups and memberships; Flightdeck owns segments. Lookup is live and read-only, with no membership replica and no directory call during evaluation. The BFF permits editor/admin search and resolve; viewers receive connection status only. Credentials and upstream URLs never go to the browser. Existing advanced configurations and stale/missing IDs are preserved.

Set `FLIGHTDECK_BC_DIRECTORY_CONFIG` to an ignored, private mode-0600 JSON file before server startup. Its shape is `{"connections":[{"projectId":"…","environmentId":"…","label":"…","baseUrl":"…","tenantId":"…","sourceId":"…","clientId":"…","clientSecret":"…"}]}`. Use real configured IDs and credentials, not these illustrative ellipses. At most 20 connections are allowed, with unique project/environment pairs. Tenant IDs are BC GUIDs normalized to lowercase (including BC-supported non-RFC GUIDs); people IDs are canonical lowercase UUIDs and organization/group IDs are canonical positive int32 decimal strings. `baseUrl` requires HTTPS except on loopback and cannot contain credentials, query or fragment. An absent variable means disconnected; an invalid configured file fails startup rather than silently disabling the connection.

Include any supported BC deployment prefix in `baseUrl`; OAuth, search and resolve preserve it. Source IDs are bounded to 128 characters and remain complete in targeting predicates even when a generated display name is shortened.

The supported credential API is implemented in a **separate BC PR and is not released now**. It requires BC directory enablement/source configuration and the existing API enablement gates. A tenant administrator (or existing superadmin) creates a credential with `POST /api/tenants/:tenantId/directory-credentials`, body `{organizationId,name}`; the one-time response is `{id,sourceId,tenantId,oauth:{client_id,client_secret}}`. Store that secret privately; it is not retrievable later. Revoke through `DELETE /api/tenants/:tenantId/directory-credentials/:credentialId`. Tenant-admin onboarding also requires BC's tenant self-service administration gate. Use BC's existing `POST /api/external/oauth/token` client-credentials endpoint; the dedicated token has purpose `flightdeck-directory`, exact scope `flightdeck-directory:read` and an actual-tenant-bound audience. These credentials do not grant ordinary BC API access. Browser cookies, BC signing secrets and direct SQL are not supported substitutes.

The BFF calls bounded `/api/external/flightdeck-directory/v1/search` and `/resolve`. Tenant, subject, source and effective organization/group membership fields have built-in types; directory selection does not require a manual catalog preparation write. Incompatible declared directory types are rejected. Custom traits use the environment-local catalog. Direct selections compile to tenant/source guards plus people `in` or membership `contains_any`, OR with segments. Segment alternatives/traits save to a draft before separate review/publication.

The separate BC consumer adapter supplies trusted UUID/membership context and fresh actual-tenant admission metadata, never browser-projected membership. Unassigned or foreign tenants retain legacy BC evaluation without a Flightdeck network request. Production operator identity, shared-environment onboarding and deployment remain external gates. See the [architecture boundary](architecture.md#optional-directory-integration-and-consumer-supplied-context) and the opt-in connected recording below.

## Reusable consumer contract lab

Keep Flightdeck running, then in a second terminal:

```sh
pnpm demo:seed
pnpm demo
```

Open **http://localhost:4722**. Initial setup adds four demo flags and publishes the `consumer-demo-alpha-pilots` segment through the separate segment draft/publication API in **Sandbox / Development**. Re-running setup preserves existing owned configurations, published segments and its dedicated evaluation credential; a conflicting definition is rejected rather than overwritten. Migration setup must be current. The credential is read-only for evaluation, scoped to tenant `consumer-demo` and retained in ignored mode-0600 `.local/consumer-demo/config.json`; it never enters the browser. Do not delete that file to repair revocation: issue/configure a replacement deliberately.

Choose Mira (Alpha pilot), Kai (standard member) or Rowan (multiple memberships), then **Evaluate capability**. On the initial seeded configuration, Mira and Rowan receive the title filter; Kai does not. The backend constructs canonical synthetic subject, deployment source, tenant and membership lists from the known persona ID; browser-supplied context/extra fields are rejected. Source membership in this lab is synthetic, not a real BC directory.

The other capabilities exercise string, numeric and object OpenFeature detail APIs. **Unavailable** and **Malformed response** deliberately call a local simulated transport and visibly identify the caller default. **Denied tenant** and **Invalid credential** call the real Flightdeck service and display an authorization failure, not false/fallback. Change the managed demo flag in Flightdeck and re-evaluate to see its next decision; there is no cache or polling. Selecting another person/scenario clears the old decision immediately.

### Record Flightdeck-owned demos

The committed `demo/recordings/` scenarios and presentation harness run from Flightdeck without importing BC source. The two default consumer-lab scenarios require no BC checkout or session. The optional connected scenario additionally requires an independently running BC frontend/backend with the separate consumer and directory API changes.

After the frozen install and `pnpm db:setup`, install Chromium once and provide `ffmpeg` on PATH (macOS: `brew install ffmpeg`):

```sh
pnpm demo:install
pnpm demo:record
```

By default, `demo:record` rebuilds Flightdeck and records two assertion-backed browser scenarios: live membership targeting/typed configuration, and explicitly simulated fallback versus real denied-tenant failure/recovery. Captions, chapter cards and the pointer are presentation-only overlays; they do not replace application results. These default scenarios read the synthetic lab and never publish flag changes. The connected scenario is skipped unless explicitly configured.

Playwright starts Flightdeck on `4721` and seeds/starts the lab on `4722` when those services are absent, or reuses running local services. Setup checks their health identities and local-development mode before running the scenarios. PostgreSQL must already be initialized. Servers started by Playwright stop afterward; reused servers and the database remain running. Recording refuses `NODE_ENV=production`.

The scenarios expect the initial seed decisions. Setup deliberately preserves existing managed configurations and credentials; it does not overwrite edited flags to force a passing recording. If an assertion fails after editing demo targeting, inspect and deliberately restore the intended synthetic configuration in Flightdeck. Do not delete private configuration to rotate a credential.

Successful MP4s are written to:

- `.local/demos/should-consume-live-targeting-and-typed-configuration.mp4`
- `.local/demos/should-distinguish-simulated-fallback-from-live-tenant-denial-and-recovery.mp4`

Raw WebM recordings and failure screenshots remain under `.local/demos/results/`. A selected scenario's previous MP4 is removed when the run begins; failed/skipped scenarios do not export a successful clip. MP4 conversion failure makes the command fail and removes incomplete exports. Videos have burned-in captions, not an audio voiceover. All generated artifacts and private credentials remain ignored.

Pass Playwright options through the command, for example `pnpm demo:record --headed` or `pnpm demo:record --grep 'live targeting'`. To add another reusable demo, commit a `*.demo.ts` scenario under `demo/recordings/`, import its presentation fixture from `harness.ts`, keep selectors in a page model and assert actual user-visible outcomes before presenting them as proof. Use distinct scenario titles so export filenames cannot collide. Keep pure evaluator/HTTP regressions in the existing lower-level suites rather than substituting narrated demos for those tests.

#### Record the unified redesign workflow

The unified scenario passed in the recorded local verification; a fresh run must still meet its own assertions before being treated as evidence. Seed Sandbox first and run a local Development dashboard, not master:

```sh
FLIGHTDECK_UNIFIED_DEMO=1 \
FLIGHTDECK_UNIFIED_DEMO_CONFIG=/absolute/private/consumer-demo/config.json \
pnpm exec playwright test --config playwright.demo.config.ts demo/recordings/unified-design.demo.ts
```

The supplied config must be an owned regular mode-0600 consumer-demo file. Setup authenticates the actual deployment and refuses reused master/non-Development dashboards. Its read-only evaluator credential stays server-side. The scenario creates fresh UUID-suffixed owner-guarded disposable flag/segment records and retains immutable audit history; there is no delete endpoint and existing consumer flags are not reset. On success, flag configuration/gate restoration uses optimistic guards, while segment published v2 and historical v1 restored as non-live draft v3 remain retained. Failed runs may stop earlier; inspect the `retained-unified-demo-records` attachment for IDs and actual flag-restoration completion. Do not erase records or private credentials to make reruns pass.

#### Record connected BC directory authoring

Use disposable local BC data only. Start BC's frontend on `4740` and its separately built backend on `4741`. Admit `public-api-legacy` through its supported package configuration; for local development, `COSMOS_ENABLED_PACKAGES=public-api-legacy` is supported. Enable `BC_FLIGHTDECK_DIRECTORY_ENABLED=true`, set `BC_FLIGHTDECK_DIRECTORY_SOURCE_ID`, and enable the persisted global `ONEBRIEF_API_ENABLED` gate. `BC_ONEBRIEF_API_ENABLED=true` also prevents startup synchronization from turning that gate off.

Provision an actual tenant, human account, organization and group through BC administration. Assign the account to that tenant and group. Issue the dedicated authoring credential described above; configure Flightdeck's connection with `baseUrl: "http://localhost:4743"`. This port belongs to the recording's transparent authoring relay, not the BC backend. Restart Flightdeck with `FLIGHTDECK_BC_DIRECTORY_CONFIG` pointing to its private connection file.

Keep this scenario separate from the Sandbox consumer lab. Create `bc-homepage-title-filter` in **Flightdeck / Development** (`20000000-0000-4000-8000-000000000001` / `30000000-0000-4000-8000-000000000001`) with owner `Flightdeck directory demo` and `[flightdeck-bc-directory-demo]` in its description. Enable the flag, prepare the standard BC targeting fields, and explicitly publish a simple Boolean configuration against the current catalog. Configure BC's consumer with a separate evaluation credential granting this actual tenant, this project/environment, and the same source ID.

Create an ignored, owned mode-0600 JSON file with exactly these fields: `bcOrigin`, `bcBackendOrigin`, `username`, `password`, `projectId`, `environmentId`, `flagKey`, `tenantId`, `sourceId`, `groupId`, `groupName`. Use loopback HTTP origins on ports `4740` / `4741`, the dedicated IDs above, the actual BC account's login/password and actual tenant/group identifiers. Never commit the file or paste its credentials into a PR.

```sh
FLIGHTDECK_BC_DEMO_CONFIG=.local/bc-directory/demo.json pnpm demo:record bc-directory.demo.ts
```

The scenario refuses other scopes and unmarked flags. It owns port `4743` exclusively and fails on a collision; stop any manually started relay first. It proves an authenticated false/filter-absent baseline, selects the actual group through Flightdeck's UI, publishes its normal guarded predicates, and requires the same BC account to receive true with the real title filter visible. Stopping the actual relay then produces a directory-search 503 while fresh BC evaluations still succeed; no invented upstream payloads or browser interception are used.

Finally, the scenario restores the dedicated flag's original configuration through optimistic revision checks. This deliberately adds audit/revision entries; a concurrent flag/catalog change prevents restoration rather than being overwritten. Both the primary failure and any restoration failure are retained. The recording leaves BC and reused Flightdeck services running but closes its relay; ordinary manual use should point the private connection directly to BC or run the relay explicitly. Successful output is `.local/demos/should-author-a-real-bc-group-and-evaluate-through-an-authoring-outage.mp4`. This local proof is not production identity, cloud deployment or populated-list filtering evidence.

### OpenFeature backend use

The independent `packages/openfeature-provider` package includes distributable JS/types and has only public package dependencies. Its compiled `dist/index.js` and `dist/index.d.ts` are versioned release assets: run the provider build before publishing a new immutable Git pin. Consumers do not run a preparation script or install Flightdeck's private Atlas dependencies; no provider build-script approval is required. Its peer is `@openfeature/server-sdk` `^1.23.0` (SDK core peer `^1.12.0`). Use the typed detail API, then enforce the application's non-fallback policy:

```ts
await OpenFeature.setProviderAndWait(
  'my-consumer',
  new FlightdeckProvider({
    baseUrl,
    token,
    projectId,
    environmentId,
    timeoutMs: 1000,
  })
);
const details = enforceFlightdeckPolicy(
  await OpenFeature.getClient('my-consumer').getBooleanDetails(
    'bc-homepage-title-filter',
    existingApplicationDefault,
    {
      targetingKey: accountUuid,
      tenantId: trustedTenantBinding,
      sourceId: trustedSourceBinding,
      organizationIds: effectiveOrganizationIds,
      groupIds: effectiveGroupIds,
    }
  )
);
```

Import `OpenFeature` from `@openfeature/server-sdk` and `FlightdeckProvider` / `enforceFlightdeckPolicy` from `@flightdeck/openfeature-provider`. Project/environment/credential and tenant/source bindings are server configuration, not browser inputs. SDK value-only methods return defaults on errors and do not enforce this authorization policy. Inspect details to distinguish a service decision from recovery. See [supported context and error semantics](evaluation-spec.md#openfeature-server-provider).

### Separate BC integration

BC owns its adapter and deployment configuration. The opt-in bootstrap path maps only `HOMEPAGE_CARDS_SHARED_TEXT_FILTER` to `bc-homepage-title-filter`; all other flags retain BC's evaluator. Required backend settings are `BC_FLIGHTDECK_ENABLED=true`, `BC_FLIGHTDECK_BASE_URL`, `BC_FLIGHTDECK_EVALUATION_TOKEN`, `BC_FLIGHTDECK_PROJECT_ID`, `BC_FLIGHTDECK_ENVIRONMENT_ID`, `BC_FLIGHTDECK_TENANT_ID` and `BC_FLIGHTDECK_SOURCE_ID`. `BC_FLIGHTDECK_TIMEOUT_MS` defaults to 250 and is bounded to 1–10000 ms. Disabling the integration retains BC behavior; enabled incomplete configuration is an error.

The tenant must be the account's actual BC tenant UUID, not a deployment alias or inferred organization. Issue a dedicated environment credential whose tenant grant agrees with that binding; the lab and bootstrap credentials do not automatically authorize BC. Keep it in BC's backend secret configuration, never a Vite variable or browser storage. Fresh BC storage establishes tenant admission and active tenant-owned effective memberships; global bootstrap does not assert a singular current organization. A refreshed authenticated bootstrap/page load consumes the current decision; no Flightdeck-to-BC push event is implemented. A recoverable error uses the existing BC-evaluated Boolean; an authorization/invalid-context error fails bootstrap explicitly.

## Evaluate from a separate backend process

After creating a flag in the Flightdeck project's development environment:

```sh
pnpm consumer new-workspace-navigation '{"type":"boolean","value":false}' '{"tenantId":"local-tenant","subjectId":"person-0","attributes":{}}'
```

Replace the key with your flag. The second argument is the required tagged fallback; choose its type and value for the consuming feature's safety requirements. The optional third argument is context (default: `{"tenantId":"local-tenant","attributes":{}}`). Decisions include reason, revisions, variant/rule/override IDs and trace. A 401/403 throws rather than applying fallback.

The launcher reads its backend-only evaluation credential from private local configuration. It never sends that secret to the browser or logs it. `examples/evaluate.ts` is an importable backend client with required project/environment/key/tagged fallback/context, response scope/type validation and a finite timeout. No cache or retry mechanism is implied.

Administrators issue/revoke credentials for the selected environment with 1–20 explicit allowed tenant IDs. A secret appears only at issuance; store it in the intended backend's secret store, never browser storage/source. Only SHA-256 verifiers persist. The bootstrap credential permits Flightdeck/development and `local-tenant` only. Caller traits are trusted-backend assertions, not a BC membership proof.

**Breaking local API cutover:** evaluation now uses POST with `{context}` and tagged response values. GET evaluation is removed. OpenAPI version `2.0.0` documents this preproduction contract replacement despite the retained `/api/v1` route prefix. All repository callers are migrated; Stage 1 examples are historical, not supported aliases.

## Atlas composition

Use a separately installed, built, compatible Atlas checkout. Flightdeck remains independently built and running:

```sh
ATLAS_CHECKOUT=/absolute/path/to/atlas pnpm shell
```

Open **http://localhost:4720**, sign into Atlas's demo shell, then open Flightdeck from its application navigation. The Flightdeck page can establish its own explicit local session if you have not already signed in at port 4721. Use `localhost` consistently in both tabs so the local cookie host agrees.

The launcher changes shell configuration only; it does not modify Atlas source. It enables `flightdeck` and points discovery to `http://localhost:4721`. The service exposes its generated `atlas-app.json` and `remoteEntry.js` at that application root, with federation chunks under `/remote/`. The SDK prefixes API calls with `/api`, so the adapter supplies API-relative paths. Standalone assets live in `dist/web`; federation assets live in `dist/remote`, so the two builds do not erase each other. Embedded pages do not duplicate the shell's chrome.

Current compatibility set: Atlas SDK/UI/BFF/Vite/shell-contract `0.1.0`, UX Kit `0.1.0`, React/React DOM `19.2.7`, Vite `8.2.1`, TypeScript `6.0.3`. Upgrade the shell and remote shared singleton requirements together. The public SDK does not carry organization membership or roles, and its shell session remains a demo identity contract.

## Validation commands

```sh
pnpm lint
pnpm typecheck
pnpm contracts --check
pnpm build
pnpm fmt:check
pnpm db:setup
pnpm test
```

`pnpm check` groups lint, typecheck, API-contract consistency, both frontend builds and formatting. `pnpm test` supplies separate owner/runtime connections to the real disposable `flightdeck_test` database; database tests fail rather than silently substituting an in-memory store when those connections are absent. Test fixture reset refuses non-`_test` databases and mismatched servers/identities. Tests do not reset the application's `flightdeck` database.

Regenerate `api/openapi.json` with `pnpm contracts` after changing runtime schemas/API operations. Its consistency check ignores formatting differences, not schema differences.

Browser smoke includes structured typed-value/rule/segment authoring, invalid weights/JSON, explicit reassignment review, same-context current/API parity, override create/revoke, viewer simulation and unchanged environment scope. Restart and confirm stable identity/assignment. Repeat inside the separate Atlas shell in dark/light themes. [Stage 2 evidence](stage-two-verification.md) records actual observed scenarios.

## Persistence and credentials

`pnpm db:setup` provisions a dedicated `flightdeck-local` Compose project using PostgreSQL 17. Its named volume is `flightdeck-local-postgres`. The owner database identity runs checksum-tracked migrations under an advisory lock; `flightdeck_runtime` has only required data privileges. Runtime cannot create application tables, alter schema, read migration history or update/delete audit rows.

Private configuration is `.local/flightdeck/config.json`, under a mode-0700 directory with a mode-0600 file. It contains local database passwords, a session signing secret and the example evaluation token. Setup reuses that file and refuses to generate replacement credentials if an existing named database volume has lost its config. Restore the existing private config instead; deleting a volume to solve a credential error loses data and is not a migration.

```sh
pnpm db:stop
```

Stop the backend with Ctrl-C. Stopping the database preserves data. There is deliberately no destructive reset command.

For explicit owner-run migration execution outside local setup, set `FLIGHTDECK_MIGRATION_DATABASE_URL` privately and run `pnpm migrate`. Direct backend startup requires `FLIGHTDECK_MODE=local-development`, a non-production `NODE_ENV`, restricted `FLIGHTDECK_DATABASE_URL` and private `FLIGHTDECK_SESSION_SECRET`; normal local startup supplies them without command-line secrets. Both direct startup and the local launcher reject production mode.

### Storage ownership and growth

All tables are owned by Flightdeck's migration identity; runtime grants are explicit. This development slice has no automatic retention deletion or backup guarantees. Data remains until the local owner deliberately retires the instance; do not use it for shared/production data until numeric retention/deletion and backup/recovery objectives are agreed.

| Table                                                  | Growth, access and indexes                                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations`, `projects`, `environments`            | Explicit local bootstrap scope; primary/unique keys and organization/project foreign keys; read-only to runtime                                  |
| `flags`                                                | Immutable project/key identity; legacy metadata retained as migration history, not current shared mutable metadata                               |
| `configurations`                                       | Environment-local metadata/lifecycle/archive/revision plus bounded typed configuration; composite project FKs and immutable allocation namespace |
| `audit`                                                | Historical/flag before-after snapshots; environment-local flag/revision uniqueness; append-only to runtime                                       |
| `credentials`                                          | One verifier row per issuance; revoked rows retained; unique verifier and scope/created-time index; only revocation column is runtime-updatable  |
| `schema_migrations`                                    | One name/checksum per applied migration, owner-only; no runtime access                                                                           |
| `project_targeting`                                    | Retained legacy project catalog for migration evidence; current custom attributes are environment-local                                          |
| `project_targeting_audit`                              | Retained append-only historical project catalog snapshots, not current publication state                                                         |
| `environment_targeting`, `environment_targeting_audit` | Environment-local typed attributes and append-only history; older project catalogs/history retained as migration evidence                        |
| `segments`, `segment_history`                          | Scoped draft/current publication and immutable historical definitions with optimistic revision guards                                            |
| `unified_audit`                                        | Append-only scoped flag/segment before/after and exact publication impact; no raw evaluation context                                             |
| `subject_overrides`                                    | Scoped exact targets with owner/reason/expiry; composite FKs, unique unrevoked target and expiry indexes; runtime updates revocation only        |

Audit growth follows successful mutations, not evaluations. Evaluation contexts are not retained; override target IDs intentionally persist as management records. Inventory is bounded to 20/page; activity/catalog history/credentials/overrides to 100. Project enumeration remains limited to the fixed local bootstrap set; broader provisioning/pagination is not shipped. Revoked/expired overrides and historical catalog snapshots are retained without automatic cleanup.

## Onboarding record and remaining external gates

| Contract                                              | Owning boundary                                           | Current state / required next action                                                                                                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production operator identity and membership           | Identity platform owners + Flightdeck authorization owner | No production issuer/membership contract established; current Atlas SDK lacks role/tenant claims. Agree issuer, audience, verification, membership, revocation and project delegation before real data.                  |
| BC user/account subject mapping                       | BC application owners + Flightdeck API owner              | Locally exercised through the separate opt-in BC change: canonical UUID, fresh actual tenant and active tenant-scoped effective memberships. Production identity/delegation and shared-environment approval remain open. |
| Namespace, deployment permission and runtime bindings | Atlas environment maintainers                             | Flightdeck is not admitted by this local implementation. Request namespace/RBAC, database/roles/secrets, migration execution and bilateral network rules.                                                                |
| Artifacts and bundle intake                           | Flightdeck release owner + Atlas deployment maintainers   | No publication/deployment performed. Agree approved image/chart/contract/Zarf publication and digest-pinned v2 UDS intake. A personal GitHub repository does not inherit Atlas's deploy role.                            |
| CI package/network access                             | Flightdeck repository administrators + Nexus maintainers  | Configure `NEXUS_RO_USER`, `NEXUS_RO_TOKEN` and a runner that can reach approved Nexus. `FLIGHTDECK_RUNNER` can select an approved runner; the default hosted runner's private-network reachability is not established.  |
| Recovery, retention and data classification           | Flightdeck service owner + Atlas database/security owners | Local-only policy above. Agree numeric retention, deletion, audit access, backup/restore and recovery objectives before shared use.                                                                                      |

These are ownership boundaries, not invented assignments to named engineers. Individual approvers and environment approvals are not established in the inspected source contracts. No onboarding request, secret change, artifact publication or cloud deployment is implied by this record.

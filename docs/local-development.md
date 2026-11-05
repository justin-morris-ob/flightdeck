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

| Operator      | Permission                                                   | Organization                |
| ------------- | ------------------------------------------------------------ | --------------------------- |
| Alex Morgan   | Administrator: flag changes and scoped credential management | Flightdeck development      |
| Ellis Chen    | Editor: flag changes, no credential management               | Flightdeck development      |
| Vera Singh    | Viewer: read-only flags and segments in the simplified UI    | Flightdeck development      |
| Jordan Rivera | Administrator of the isolated test organization only         | Isolation test organization |

These identities are fixed server-owned fixtures. The browser cannot choose its role or organization by posting those values. Session responses resolve the administrative organization's display name from PostgreSQL using the authenticated operator's organization ID; every session-producing path uses that same read. Selecting another development operator deliberately switches identity. Atlas's independently selected demo name does not establish Flightdeck authorization.

The main organization has Flightdeck and Sandbox projects, each with development and simulated production environments. Creation adds an immutable project-scoped key, initially disabled everywhere with boolean off false/default true. Configuration and overrides are environment-specific; metadata, archive state and revision are project-wide. Archived flags retain configuration and return the typed off value with reason `archived`. Unknown keys return 404, not a successful false decision.

### Projects and the shared flag inventory

A project owns one flag set; environments configure that same set differently. Standalone and embedded pages expose one Flightdeck-owned **Project** selector in the always-visible scope bar, including narrow screens. Embedded pages retain Atlas chrome. Neither composition reuses the shell's unrelated project or organization display as application authorization.

The POC has exactly three project sections: **Flags**, **Segments**, and **Audit log**. Audit log is an explicitly unimplemented placeholder, not a fabricated feed. Standalone has no competing sidebar or context-pill navigation.

Flags lists names, descriptions and per-environment On/Off statuses. A name opens a small read-only overview with key, description and environments; a status opens that exact configuration without toggling it. The inventory and overview have no environment selector. Returning from a flag retains search/page and refreshes stored summaries. An absent configuration is Unavailable, never guessed Off.

Creation uses a valid project environment as its existing API transport context, creates the flag Off in every environment and opens its overview. Metadata/archive/restore, credentials and individual exceptions remain authorized API capabilities, but are not exposed in this POC UI. The same applies to advanced configuration editors, diagnostics, activity and attribute-schema editing.

Management inventory uses operator-only `GET /api/v1/projects/{projectId}/flags`, bounded to 20 shared summaries with environment gates per page. Operator-only `GET /api/v1/projects/{projectId}/flags/{flagKey}` supplies overview from one authorized metadata/gate query; no environment selection or full configuration is required. Service credentials are denied, and inaccessible project/flag combinations return 404. Existing environment POST creation, detail and mutation routes remain; no schema migration or evaluation change is required.

Flag environments are configuration scopes, not deployment environments. The entire local instance currently hosts both projects and their configurations; “Production (local simulation)” remains local-only.

Standalone links encode only `projectId`, `flagKey`, `environmentId` and the project view (`flags`, `segments`, `audit`). A flag without environment means overview; adding an environment means that exact configuration. Refresh and browser Back/Forward restore location; invalid or unauthorized scope never silently falls back to another scope. Retired catalog/credential UI locations are invalid rather than aliases. Embedded navigation registers flags, flag overview, configuration, segments and audit object types through the published Atlas SDK; Atlas owns its URL.

Unpublished creation, audience and segment forms share **Stay / Discard and leave** protection. Busy writes block transitions that would lose their state. Successful saves do not trigger a false abandoned-draft prompt. Native document unload warns where supported. Signing out clears identity-bound edits. Host-owned Atlas tab closure has no veto in the pinned SDK; persistent draft recovery is not claimed.

### Author targeting and configuration

1. Open an environment status from **Flags**, or choose an environment from a flag's overview. The detail's **Environment** selector names the exact configuration.
2. **Availability** is the On/Off master switch, confirmed for that environment. Changing it leaves saved targeting and other environments unchanged.
3. Compatible Boolean flags expose **Everyone** or **Selected segments**. Any selected segment can qualify; conditions inside a segment must all match. Empty selection matches nobody through audience targeting. Existing individual exceptions retain their precedence.
4. **Save** validates the draft with the server, then asks for confirmation in the named environment. It retains flag/catalog conflict checks and pins the current segment definitions. This is configuration validation, not real-user simulation.
5. Existing typed or otherwise non-representable configurations display a read-only explanation; only availability can change in this UI. There is no automatic lossy conversion or advanced-editor escape hatch.
6. **Segments** lists reusable audiences. Create/edit opens one focused form over existing attributes. Saving preserves the attribute schema and unrelated segments, and does not automatically update saved flag targeting. Viewer inspection is read-only.

Publication pins attribute definitions and referenced segment snapshots. Catalog edits do not change existing live decisions; refreshing to the current catalog requires explicit publication. Changing variants/weights/order may reassign subjects. Increasing a rollout preserves existing eligibility under the unchanged namespace/rule ID. Names are not allocation IDs. See the [exact evaluation specification](evaluation-spec.md).

Limits: 32 custom context definitions, 50 segments, 20 rules, 10 conditions per rule/segment, 5 segment references per rule and 10 variants. Configuration input is bounded to 24 KiB and its published snapshot to 64 KiB; individual JSON values to 4 KiB. Context is bounded to 32 KiB and string lists to 100 entries of 500 characters each. HTTP request envelopes are bounded to 64 KiB so previews can include a context and proposed configuration. Arbitrary nested traits are not supported.

### BC directory ownership and the deferred connection

BC remains authoritative for users/accounts, organizations, groups and effective memberships. Flightdeck owns its segment definitions. An optional authoring connection will resolve email/name for selection but save stable, source-scoped references; a user target should use BC account UUID, not email as identity. Organization/group IDs also require a BC deployment/source namespace. BC's trusted backend supplies approved identity and membership context for evaluation, not browser claims or manual copies of users into every segment. Group-predicate segments can match that supplied membership without replicating the group's member list.

Flightdeck does not add BC directory/sync APIs, directory credentials or replicated PII storage. Inspection found session-authenticated internal BC search/resolve endpoints, not a supported service-authenticated directory contract for Flightdeck. A future authoring connection needs explicit read scopes, bounded wire contracts, source/environment mapping and active/deleted behavior. Reusing browser cookies, BC signing secrets or direct BC SQL is not that contract. Live read-only authoring lookup is the recommended starting point. It is not an evaluation dependency: existing saved rules evaluate supplied context when directory search is unavailable, with no per-decision callback to BC.

Collection-valued targeting and the server OpenFeature provider are now implemented. The separate BC bootstrap adapter sends effective organization/group membership, not a current organization inferred from browser navigation. Directory selectors remain disabled until the optional lookup/resolve integration exists. BC pickers must create generic Flightdeck rules, not a separate evaluator. See the [architecture boundary](architecture.md#optional-directory-integration-and-consumer-supplied-context).

## Reusable consumer contract lab

Keep Flightdeck running, then in a second terminal:

```sh
pnpm demo:seed
pnpm demo
```

Open **http://localhost:4722**. Initial setup adds four demo flags and an Alpha-pilot membership segment to **Sandbox / Development**, without resetting existing records or requiring another migration. Re-running setup preserves existing demo configurations; a conflicting key/definition is rejected rather than overwritten. The demo's dedicated evaluation credential is scoped to tenant `consumer-demo` and retained in ignored mode-0600 `.local/consumer-demo/config.json`. Do not delete this file to repair a revoked credential: issue and deliberately configure a replacement instead.

Choose Mira (Alpha pilot), Kai (standard member) or Rowan (multiple memberships), then **Evaluate capability**. On the initial seeded configuration, Mira and Rowan receive the title filter; Kai does not. The backend constructs canonical synthetic subject, deployment source, tenant and membership lists from the known persona ID; browser-supplied context/extra fields are rejected. Source membership in this lab is synthetic, not a real BC directory.

The other capabilities exercise string, numeric and object OpenFeature detail APIs. **Unavailable** and **Malformed response** deliberately call a local simulated transport and visibly identify the caller default. **Denied tenant** and **Invalid credential** call the real Flightdeck service and display an authorization failure, not false/fallback. Change the managed demo flag in Flightdeck and re-evaluate to see its next decision; there is no cache or polling. Selecting another person/scenario clears the old decision immediately.

### Record Flightdeck-owned demos

The committed `demo/recordings/` scenarios and presentation harness run entirely from Flightdeck. They do not import BC source, require a BC checkout or use BC browser sessions. The real BC integration walkthrough remains a separate BC-owned scenario.

After the frozen install and `pnpm db:setup`, install Chromium once and provide `ffmpeg` on PATH (macOS: `brew install ffmpeg`):

```sh
pnpm demo:install
pnpm demo:record
```

`demo:record` rebuilds Flightdeck and records two assertion-backed browser scenarios: live membership targeting/typed configuration, and explicitly simulated fallback versus real denied-tenant failure/recovery. Captions, chapter cards and the pointer are presentation-only overlays; they do not replace application results. The scenarios read the synthetic lab and never publish flag changes.

Playwright starts Flightdeck on `4721` and seeds/starts the lab on `4722` when those services are absent, or reuses running local services. Setup checks their health identities and local-development mode before running the scenarios. PostgreSQL must already be initialized. Servers started by Playwright stop afterward; reused servers and the database remain running. Recording refuses `NODE_ENV=production`.

The scenarios expect the initial seed decisions. Setup deliberately preserves existing managed configurations and credentials; it does not overwrite edited flags to force a passing recording. If an assertion fails after editing demo targeting, inspect and deliberately restore the intended synthetic configuration in Flightdeck. Do not delete private configuration to rotate a credential.

Successful MP4s are written to:

- `.local/demos/should-consume-live-targeting-and-typed-configuration.mp4`
- `.local/demos/should-distinguish-simulated-fallback-from-live-tenant-denial-and-recovery.mp4`

Raw WebM recordings and failure screenshots remain under `.local/demos/results/`. A selected scenario's previous MP4 is removed when the run begins; failed/skipped scenarios do not export a successful clip. MP4 conversion failure makes the command fail and removes incomplete exports. Videos have burned-in captions, not an audio voiceover. All generated artifacts and private credentials remain ignored.

Pass Playwright options through the command, for example `pnpm demo:record --headed` or `pnpm demo:record --grep 'live targeting'`. To add another reusable demo, commit a `*.demo.ts` scenario under `demo/recordings/`, import its presentation fixture from `harness.ts`, keep selectors in a page model and assert actual user-visible outcomes before presenting them as proof. Use distinct scenario titles so export filenames cannot collide. Keep pure evaluator/HTTP regressions in the existing lower-level suites rather than substituting narrated demos for those tests.

### OpenFeature backend use

The independent `packages/openfeature-provider` package builds distributable JS/types and has only public package dependencies. Its own workspace boundary and lockfile keep Git-subdirectory preparation from installing Flightdeck's private Atlas dependencies. Consumers pin the exact Git commit/subdirectory and explicitly approve only that source's preparation script under their package-manager policy. Its peer is `@openfeature/server-sdk` `^1.23.0` (SDK core peer `^1.12.0`). Use the typed detail API, then enforce the application's non-fallback policy:

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

The tenant/source is an explicit deployment binding, not an inferred organization. Issue a dedicated environment credential whose tenant grant agrees with that binding; the lab and bootstrap credentials do not automatically authorize BC. Keep it in BC's backend secret configuration, never a Vite variable or browser storage. BC's session-derived canonical account UUID and existing effective memberships supply the context; global bootstrap does not assert a singular current organization. A refreshed authenticated bootstrap/page load consumes the current decision; no Flightdeck-to-BC push event is implemented. A recoverable error uses the existing BC-evaluated Boolean; an authorization/invalid-context error fails bootstrap explicitly.

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

| Table                                       | Growth, access and indexes                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations`, `projects`, `environments` | Explicit local bootstrap scope; primary/unique keys and organization/project foreign keys; read-only to runtime                                        |
| `flags`                                     | One row per immutable project/key; bounded metadata; unique `(project_id, key)` supports cursor inventory and scope                                    |
| `configurations`                            | One bounded typed/pinned snapshot per flag/environment; composite project FKs; immutable allocation namespace checked on publication                   |
| `audit`                                     | One allowlisted bounded before/after snapshot per successful flag revision; unique flag/revision plus descending history index; append-only to runtime |
| `credentials`                               | One verifier row per issuance; revoked rows retained; unique verifier and scope/created-time index; only revocation column is runtime-updatable        |
| `schema_migrations`                         | One name/checksum per applied migration, owner-only; no runtime access                                                                                 |
| `project_targeting`                         | One bounded current catalog per project; project primary key and expected catalog revision                                                             |
| `project_targeting_audit`                   | Append-only actor/before/after catalog history; project/revision uniqueness and descending history index                                               |
| `subject_overrides`                         | Scoped exact targets with owner/reason/expiry; composite FKs, unique unrevoked target and expiry indexes; runtime updates revocation only              |

Audit growth follows successful mutations, not evaluations. Evaluation contexts are not retained; override target IDs intentionally persist as management records. Inventory is bounded to 20/page; activity/catalog history/credentials/overrides to 100. Project enumeration remains limited to the fixed local bootstrap set; broader provisioning/pagination is not shipped. Revoked/expired overrides and historical catalog snapshots are retained without automatic cleanup.

## Onboarding record and remaining external gates

| Contract                                              | Owning boundary                                           | Current state / required next action                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production operator identity and membership           | Identity platform owners + Flightdeck authorization owner | No production issuer/membership contract established; current Atlas SDK lacks role/tenant claims. Agree issuer, audience, verification, membership, revocation and project delegation before real data.                 |
| BC user/account subject mapping                       | BC application owners + Flightdeck API owner              | Not established; backend example is not a BC integration. Stage 3 must agree tenant authority and an actual BC feature path.                                                                                            |
| Namespace, deployment permission and runtime bindings | Atlas environment maintainers                             | Flightdeck is not admitted by this local implementation. Request namespace/RBAC, database/roles/secrets, migration execution and bilateral network rules.                                                               |
| Artifacts and bundle intake                           | Flightdeck release owner + Atlas deployment maintainers   | No publication/deployment performed. Agree approved image/chart/contract/Zarf publication and digest-pinned v2 UDS intake. A personal GitHub repository does not inherit Atlas's deploy role.                           |
| CI package/network access                             | Flightdeck repository administrators + Nexus maintainers  | Configure `NEXUS_RO_USER`, `NEXUS_RO_TOKEN` and a runner that can reach approved Nexus. `FLIGHTDECK_RUNNER` can select an approved runner; the default hosted runner's private-network reachability is not established. |
| Recovery, retention and data classification           | Flightdeck service owner + Atlas database/security owners | Local-only policy above. Agree numeric retention, deletion, audit access, backup/restore and recovery objectives before shared use.                                                                                     |

These are ownership boundaries, not invented assignments to named engineers. Individual approvers and environment approvals are not established in the inspected source contracts. No onboarding request, secret change, artifact publication or cloud deployment is implied by this record.

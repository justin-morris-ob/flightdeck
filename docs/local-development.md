# Local Flightdeck development

## Prerequisites

- Node `26.12.1`, pnpm `11.23.0`, Docker with Compose and approved Nexus read access.
- Route `@onebrief` through the committed `.npmrc`. Keep URL-scoped Nexus credentials in your private user configuration, never in this repository.
- Local ports: Flightdeck `4721`, optional Atlas shell `4720`, PostgreSQL `55471`.

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

The main organization has Flightdeck and Sandbox projects, each with development and simulated production environments. Creation adds an immutable project-scoped key, initially disabled everywhere with boolean off false/default true. Configuration and overrides are environment-specific; metadata, archive state and revision are project-wide. Archived flags retain configuration and return the typed off value with reason `archived`. Unknown keys return 404, not a successful false decision.

### Author targeting and configuration

1. In **Project targeting catalog**, define typed scalar attributes and reusable AND segments. Catalog saves require their own expected revision and retain actor history.
2. Open a flag's **Configuration** tab. Choose boolean/string/number/JSON; set off/default outcomes, variants and ordered rules. All fixed/variant payloads must share the selected type. All variant weights must total 10000 integer basis points.
3. Each rule matches its conditions AND attached segments, then applies rollout admission. Rules are first-match; the default applies if none is eligible. Read the displayed “who → fraction → outcome” summary.
4. Supply actual tenant, stable subject and optional typed attributes in the playground. Preview shows current/proposed values, gate, variant, rule, revisions and trace. Review reassignment warnings and explicitly confirm publication. Viewers can simulate the published configuration without authoring.
5. **Subject overrides** requires an exact tenant/subject, owner, reason and future expiry. Overrides precede rules, never archive/disable gates. Revoke explicitly; expiry equality is already expired.

Publication pins attribute definitions and referenced segment snapshots. Catalog edits do not change existing live decisions; refreshing to the current catalog requires explicit publication. Changing variants/weights/order may reassign subjects. Increasing a rollout preserves existing eligibility under the unchanged namespace/rule ID. Names are not allocation IDs. See the [exact evaluation specification](evaluation-spec.md).

Limits: 32 custom context definitions, 50 segments, 20 rules, 10 conditions per rule/segment, 5 segment references per rule and 10 variants. Configuration input is bounded to 24 KiB and its published snapshot to 64 KiB; individual JSON values to 4 KiB, HTTP request bodies to 32 KiB. Evaluation context contains scalar attributes, not arbitrary nested traits.

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

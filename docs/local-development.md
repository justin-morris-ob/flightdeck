# Local Flightdeck development

## Prerequisites

- Node `26.12.1`, pnpm `11.23.0`, Docker with Compose and approved Nexus read access.
- Route `@onebrief` through the committed `.npmrc`. Keep URL-scoped Nexus credentials in your private user configuration, never in this repository.
- Local ports: Flightdeck `4721`, optional Atlas shell `4720`, PostgreSQL `55471`.

Stage 1 is intentionally a loopback-only development application using synthetic identities and data. `Production (local simulation)` is an environment label, not a deployed production environment. Do not put organizational/customer data in this instance.

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

The backend serves both built browser assets and the API; `pnpm dev` currently starts that same built application. After changing frontend code, run `pnpm build` and reload. Backend changes require a restart. There is no separate Vite/backend two-port development workflow in Stage 1.

### Local roles

| Operator      | Permission                                                    | Organization                |
| ------------- | ------------------------------------------------------------- | --------------------------- |
| Alex Morgan   | Administrator: flag changes and scoped credential management  | Flightdeck development      |
| Ellis Chen    | Editor: flag changes, no credential management                | Flightdeck development      |
| Vera Singh    | Viewer: inventory, activity and evaluation preview, no writes | Flightdeck development      |
| Jordan Rivera | Administrator of the isolated test organization only          | Isolation test organization |

These identities are fixed server-owned fixtures. The browser cannot choose its role or organization by posting those values. Selecting another development operator deliberately switches identity. Atlas's independently selected demo name does not establish Flightdeck authorization.

The main organization has Flightdeck and Sandbox projects, each with development and simulated production environments. Creation adds one immutable project-scoped flag key, initially disabled in every environment. Enabled state is environment-specific; name, description, owner, archive state and revision are project-wide. Archived flags retain their underlying configuration, evaluate false with reason `archived`, and may be restored. Unknown keys return 404 rather than a successful false evaluation.

## Evaluate from a separate backend process

After creating a flag in the Flightdeck project's development environment:

```sh
pnpm consumer new-workspace-navigation false
```

Replace the key with the flag you created. The second argument explicitly selects this example consumer's fallback; choose it based on the consuming feature's safety requirements. The result distinguishes a validated service decision from a fallback and includes its reason and revision. A 401/403 authorization failure throws rather than applying a fallback.

The launcher reads its backend-only evaluation credential from private local configuration. It never sends that secret to the browser or logs it. `examples/evaluate.ts` is also an importable backend client with required project/environment/key/fallback, response validation and a finite timeout. No cache or retry mechanism is implied.

Administrators can issue/revoke additional evaluation credentials for the selected environment in the UI. A new secret is shown only at issuance; copy it into the intended backend's secret store, not application source or browser storage. Only SHA-256 verifiers persist in PostgreSQL. The local bootstrap consumer credential is development-only and restricted to Flightdeck/development.

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

Browser smoke sequence: create → enable development → inspect decision and activity → inspect unchanged production → edit metadata → archive/restore → switch viewer and inspect read-only controls. Restart the backend and confirm the same flag ID, configuration revision and decision remain. Repeat the shared-page flow inside the separately launched Atlas shell, including dark/light themes.

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
| `configurations`                            | One row per flag/environment; composite project FKs prevent cross-project references; primary flag/environment and environment/flag index              |
| `audit`                                     | One allowlisted bounded before/after snapshot per successful flag revision; unique flag/revision plus descending history index; append-only to runtime |
| `credentials`                               | One verifier row per issuance; revoked rows retained; unique verifier and scope/created-time index; only revocation column is runtime-updatable        |
| `schema_migrations`                         | One name/checksum per applied migration, owner-only; no runtime access                                                                                 |

Audit growth follows successful mutations, not evaluations. Evaluation subject/context data is not retained. Inventory and activity APIs enforce page limits; credential lists are bounded to the latest 100. Project enumeration is limited to the fixed local bootstrap set in Stage 1; broader project provisioning/pagination is not shipped.

## Onboarding record and remaining external gates

| Contract                                              | Owning boundary                                           | Stage 1 state / required next action                                                                                                                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production operator identity and membership           | Identity platform owners + Flightdeck authorization owner | No production issuer/membership contract established; current Atlas SDK lacks role/tenant claims. Agree issuer, audience, verification, membership, revocation and project delegation before real data.                 |
| BC user/account subject mapping                       | BC application owners + Flightdeck API owner              | Not established; backend example is not a BC integration. Stage 3 must agree tenant authority and an actual BC feature path.                                                                                            |
| Namespace, deployment permission and runtime bindings | Atlas environment maintainers                             | Flightdeck is not admitted by this local implementation. Request namespace/RBAC, database/roles/secrets, migration execution and bilateral network rules.                                                               |
| Artifacts and bundle intake                           | Flightdeck release owner + Atlas deployment maintainers   | No publication/deployment performed. Agree approved image/chart/contract/Zarf publication and digest-pinned v2 UDS intake. A personal GitHub repository does not inherit Atlas's deploy role.                           |
| CI package/network access                             | Flightdeck repository administrators + Nexus maintainers  | Configure `NEXUS_RO_USER`, `NEXUS_RO_TOKEN` and a runner that can reach approved Nexus. `FLIGHTDECK_RUNNER` can select an approved runner; the default hosted runner's private-network reachability is not established. |
| Recovery, retention and data classification           | Flightdeck service owner + Atlas database/security owners | Local-only policy above. Agree numeric retention, deletion, audit access, backup/restore and recovery objectives before shared use.                                                                                     |

These are ownership boundaries, not invented assignments to named engineers. Individual approvers and environment approvals are not established in the inspected source contracts. No onboarding request, secret change, artifact publication or cloud deployment is implied by this record.

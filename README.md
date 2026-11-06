# Flightdeck

Enablements and Experiments for Onebrief: feature flags, targeted enablements, controlled rollouts and measured experiments. Independently owned here, with a standalone Onebrief-toolkit UI and a thin Atlas adapter.

## Current status

**Unified redesign — locally verified.** The replacement uses deployment-scoped Flags, Segments and Audit trail views, local lifecycle metadata and explicitly published reusable audiences. Integrated checks, 353 tests, standalone/Atlas browser flows and four recordings are recorded in [unified redesign verification](docs/stage-two-verification.md#unified-redesign-verification). Earlier checkpoint evidence remains historical, not new proof.

Flightdeck remains loopback-only with synthetic management identities and credential-scoped tenant grants. The real BC adapter lives in a separate BC change; local integration evidence is not production authentication or a deployed Atlas service. Assignment is not experiment exposure or results.

## Run locally

Use Node **26.12.1**, pnpm **11.23.0**, Docker Compose and approved Nexus read access for published Onebrief packages. Keep registry credentials outside this repository.

```sh
pnpm install --frozen-lockfile
pnpm db:setup
pnpm build
pnpm start
```

Open **http://localhost:4721**. Select **Alex Morgan** for administrator access, **Ellis Chen** for editor access or **Vera Singh** for read-only access. All are synthetic local identities. The isolated **Jordan Rivera** identity demonstrates a different organization's scope.

Use the project selector, then the three peer views: **Flags**, **Segments** and **Audit trail**. Settings is secondary navigation, not a fourth primary workflow. In local mode, the environment comes from server deployment configuration: there is no environment selector or comparison matrix. Creating a flag starts it Off only in that environment. Name, description, owner, lifecycle and archive state are environment-local; an immutable key identifies the flag across reports.

With **Group by · Lifecycle**, each lifecycle heading spans the full table and starts expanded. Click the heading, or focus it and press Enter/Space, to collapse only that lifecycle's rows; its heading and the other groups stay visible. Selecting a lifecycle filter automatically expands that group without resetting other groups' collapse choices. Collapse choices are local to the current inventory view, not saved flag state. **Group by · None** shows every returned row. Grouping and collapse apply to the current bounded page without changing search, filters or pagination.

**Create flag** and **Create segment** open dedicated screens within that project/environment context, not modal forms. Cancel or Back returns to the inventory/library; unsaved edits require explicit discard before leaving. A new segment saves as a non-live draft. Short review/publication and discard confirmations remain dialogs.

Flag creation keeps Name, Flag key, Owner and Description alongside large lifecycle cards grouped as **Delivery · Temporary** (Development/Release) and **Long-lived** (System/Permissions). The key follows Name in lowercase with underscore separators until you edit the key yourself; it is immutable after creation. Generated keys obey the existing letter-first, 100-character contract; names without a usable letter require a manually entered key.

Inspect published behavior first, then **Edit audience**, review the before/after change and publish explicitly to the named local environment. Compatible Boolean flags offer **Everyone** or **Selected audiences**; segment and direct people/organization/group alternatives are OR, and an empty selection matches nobody. The shared audience picker preserves stable selections across searches. Directory configuration is private; missing connections and failed lookups are explicit, not fabricated results. See [directory setup and boundaries](docs/local-development.md#optional-bc-directory-authoring-connection).

Flag detail follows four full-width blocks: **Lifecycle**, **Published behavior**, **Audience**, then **Test a context** on its own row. **Edit audience** expands the Audience block in place, with Discard on the left and Review changes on the right. One compact audience search finds **People**, **Organizations**, **Groups** and **Segments**, with All/type filters, grouped results and a shared removable-chip selection. Published Flightdeck segments match by name/key and remain searchable without a BC connection; draft-only segments cannot be selected. Directory lookup uses its private configured connection (two-character minimum and a short debounce), never synthetic fallback data. Clearing/changing search preserves both selection types. Create segment shares the compact membership picker but retains its separate POC fixtures and does not nest segments. **Advanced controls** is a separate, initially collapsed section below both blocks; it shares the same draft without losing edits, undo or test context when collapsed. Review changes validates the exact draft and opens one **Targeting change review** modal with before/after, scope and warnings. Cancel preserves the draft; only the modal's explicit Publish action writes it. Context testing always evaluates published configuration, not an unsaved audience draft. Metadata, advanced inspection and audit remain available.

**Segments** separates draft, current published definition, where-used and retained version history. Saving or restoring a draft changes nothing live. Segment publication atomically updates every published local reference without republishing flags or changing flag revisions, gates, direct selections or unrelated drafts. References follow the current published definition, not per-flag version pins. ANY definition block may match; ALL trait conditions within a block must match, including exact text suffix matching (`ends_with`).

**Audit trail** opens an event from anywhere in its table row, with keyboard access through the row's event button. While an event is open, a compact list shows abbreviated UTC date/time, action and the recorded flag/segment name beside the read-only detail. Full timestamps, actor, scope, identities, before/after values and recorded publication impact remain available in the detail. Switching events stays compact; **Close event** restores the full table, filters, page and focus. On narrow screens the compact list stacks above the detail.

Selected-event detail is separated into bordered cards for the event summary/metadata, recorded before/after changes, affected published references when recorded, and the historical-snapshot notice/current-object handoff. Raw snapshots remain available within the changes card; grouping does not alter or omit the recorded values.

Lifecycle is local metadata: **Development**, **Release**, **System** or **Permissions**. Saving it is not audience publication, gate activation or automatic cleanup. Typed values, ordered rules, rollouts, variants and overrides remain available without lossy conversion; synthetic-context testing evaluates published behavior without a directory lookup.

Master mode is a read-only overview of actually stored environment reports. It cannot create, edit, publish, toggle gates or send change requests. Only configured dashboard links hand off to local dashboards, where authorization still applies; absent state is unavailable, not Off.

### Separate backend consumer

For a flag you created, for example `new-workspace-navigation`:

```sh
pnpm consumer new-workspace-navigation '{"type":"boolean","value":false}' '{"tenantId":"local-tenant","subjectId":"person-0","attributes":{}}'
```

The launcher supplies a private environment-scoped evaluation credential to a separate Node process. Its tenant grant is `local-tenant`. The fallback is explicitly tagged with the expected value type; context is sent by POST. Output distinguishes a validated decision from fallback; authentication/permission failures never become fallback. No evaluation secret is shipped in the frontend. This replaces Stage 1's boolean argument and GET evaluation API.

### Reusable consumer demo

Keep Flightdeck running, then run:

```sh
pnpm demo:seed
pnpm demo
```

Open **http://localhost:4722**. The lab uses an actual backend OpenFeature provider and persisted **Sandbox / Development** flags. Switch synthetic people, exercise Boolean/string/number/object decisions, and compare real decisions with explicitly simulated recovery defaults or real denied-tenant/invalid-credential failures. The backend owns the context and secret; browser requests cannot supply arbitrary memberships. Setup preserves existing flags/configurations and retains its dedicated credential privately. See the [consumer lab guide](docs/local-development.md#reusable-consumer-contract-lab).

### Record captioned demos

With the database initialized and `ffmpeg` on PATH:

```sh
pnpm demo:install
pnpm demo:record
```

Flightdeck's committed Playwright harness records real consumer targeting, typed values, fallback and authorization scenarios with captions and a visible cursor. It starts/reuses the local Flightdeck/lab services without a BC checkout. Passing recordings export to ignored `.local/demos/`; failed assertions or MP4 export errors fail the command. See the [recording workflow](docs/local-development.md#record-flightdeck-owned-demos) for setup, artifacts and adding scenarios.

### Load inside Atlas

Keep Flightdeck running. Use a separate, installed and built compatible Atlas checkout:

```sh
ATLAS_CHECKOUT=/absolute/path/to/atlas pnpm shell
```

Open **http://localhost:4720**, sign into Atlas's demo shell and navigate to Flightdeck → Flags. Flightdeck's development session is independent of the shell's demo identity. Neither build nor standalone startup requires an Atlas source checkout.

## Check the implementation

```sh
pnpm check
pnpm test
```

`check` runs Oxlint, frontend/server typechecks, generated OpenAPI consistency, the provider package build, standalone/federation/consumer-demo builds and BC-derived Oxfmt checks. `test` runs the portable evaluator corpus, membership and actual OpenFeature SDK boundaries, consumer/session tests and real PostgreSQL/API behavior. Run `pnpm db:setup` first.

`pnpm fmt` formats code; `pnpm fmt:check` checks it. `pnpm db:stop` stops the dedicated database without deleting data. The local backend serves built assets; rebuild frontend changes and restart backend changes. See the development guide for mise commands, private-config recovery and CI prerequisites.

## Documentation

- [Local development and onboarding](docs/local-development.md): exact commands, identity boundaries, storage ownership and external gates.
- [Stage 1 verification](docs/stage-one-verification.md): observed checks, browser scenarios and limitations.
- [Stage 2 verification](docs/stage-two-verification.md): targeting, persistence, consumer and actual standalone/embedded browser evidence.
- [Evaluation specification](docs/evaluation-spec.md): exact precedence, context handling and language-neutral allocation algorithm.
- [Staged delivery plan](docs/plan.md): acceptance criteria and next stages.
- [Architecture](docs/architecture.md): ownership, identity, evaluation, storage and deployment boundaries.
- [Engineering standards](docs/standards.md): BC formatting provenance and toolchain.
- [Feature requirements](docs/conformance/feature-flags/README.md): current observable behavior, not future capabilities.
- [API contract](api/openapi.json), [contributor instructions](AGENTS.md) and [changelog](CHANGELOG.md).

## Next stage

Review the unified redesign and qualify the separate, opt-in BC consumer/directory changes for their intended environments. The local connected walkthrough and authoring-outage recordings passed; the supported BC credential API still requires its separate, unreleased BC PR. Production identity, shared-environment deployment, onboarding, shell availability handling and measured experiments remain external gates.

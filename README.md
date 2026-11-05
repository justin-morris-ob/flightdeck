# Flightdeck

Enablements and Experiments for Onebrief: feature flags, targeted enablements, controlled rollouts and measured experiments. Independently owned here, with a standalone Onebrief-toolkit UI and a thin Atlas adapter.

## Current status

**Simplified POC UI over the Stage 2/3 backend.** The visible application has three project-level sections: **Flags**, **Segments**, and **Audit log** (an explicitly unimplemented placeholder). Typed evaluation, overrides, deterministic rollouts, variants, the OpenFeature provider and consumer lab remain backend capabilities; the POC no longer exposes their advanced management tools.

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

Choose a project with the **Project** selector. **Flags** lists flag names, descriptions and per-environment statuses. A name opens a small environment overview; a status opens that exact environment's settings. Creation initializes the flag Off everywhere.

The scope bar shows the authenticated administrative organization. Standalone locations survive reload and Back/Forward; embedded pages use published Atlas object references. Unpublished creation, audience and segment changes use **Stay / Discard and leave** protection. Signing out clears identity-bound edits.

Compatible Boolean flags have an On/Off availability control and **Everyone / Selected segments** audience controls. Save validates through the existing server preview and requires confirmation for the named environment. Empty selection means nobody qualifies through audience targeting. Existing advanced/typed configurations remain preserved and read-only here, apart from their availability gate.

**Segments** provides a focused list and create/edit form using existing attributes. It preserves the underlying attribute schema and unrelated segments; saving a segment does not automatically update a flag's pinned targeting. Credentials, attribute-schema editing, individual exceptions, advanced editors, diagnostics, activity and lifecycle actions are intentionally absent from the POC UI. Their authorized APIs and stored data are unchanged.

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

Open **http://localhost:4720**, sign into Atlas's demo shell and navigate to Flightdeck → Feature flags. Flightdeck's development session is independent of the shell's demo identity. Neither build nor standalone startup requires an Atlas source checkout.

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

Complete Stage 3 through the separate, opt-in BC homepage-filter adapter and its failure-boundary walkthrough. The optional BC directory authoring connection remains a separate next slice; production identity, shared-environment deployment and measured experiments remain external gates.

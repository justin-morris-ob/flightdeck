# Flightdeck

Enablements and Experiments for Onebrief: feature flags, targeted enablements, controlled rollouts and measured experiments. Independently owned here, with a standalone Onebrief-toolkit UI and a thin Atlas adapter.

## Current status

**Stage 1 — runnable local vertical slice.** Create and manage boolean flags, publish environment-specific state, evaluate from a separate backend consumer, inspect transactional audit history and retain data across backend restarts. The same application page loads inside an unmodified, separately configured Atlas shell.

This is explicitly local development with synthetic identities, not production authentication, a deployed Atlas service or a BC integration. Targeting, percentage rollouts, variants and measured experiments remain later stages.

## Run locally

Use Node **26.12.1**, pnpm **11.23.0**, Docker Compose and approved Nexus read access for published Onebrief packages. Keep registry credentials outside this repository.

```sh
pnpm install --frozen-lockfile
pnpm db:setup
pnpm build
pnpm start
```

Open **http://localhost:4721**. Select **Alex Morgan** for administrator access, **Ellis Chen** for editor access or **Vera Singh** for read-only access. All are synthetic local identities. The isolated **Jordan Rivera** identity demonstrates a different organization's scope.

Create a flag in Flightdeck / Development, enable it, inspect its decision and activity, and confirm the simulated production environment is still disabled. Flag metadata and archive state are project-wide; enabled state is environment-specific. Writes require the expected global revision, preventing lost updates.

### Separate backend consumer

For a flag you created, for example `new-workspace-navigation`:

```sh
pnpm consumer new-workspace-navigation false
```

The launcher supplies a private environment-scoped evaluation credential to a separate Node process. Output distinguishes a validated decision from the explicitly selected fallback; authentication/permission failures never become a normal fallback. No evaluation secret is shipped in the frontend.

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

`check` runs Oxlint, frontend/server typechecks, generated OpenAPI consistency, both frontend builds and BC-derived Oxfmt checks. `test` runs behavior tests against the separately provisioned real PostgreSQL test database, plus local-session trust-boundary tests. Run `pnpm db:setup` first.

`pnpm fmt` formats code; `pnpm fmt:check` checks it. `pnpm db:stop` stops the dedicated database without deleting data. The local backend serves built assets; rebuild frontend changes and restart backend changes. See the development guide for mise commands, private-config recovery and CI prerequisites.

## Documentation

- [Local development and onboarding](docs/local-development.md): exact commands, identity boundaries, storage ownership and external gates.
- [Stage 1 verification](docs/stage-one-verification.md): observed checks, browser scenarios and limitations.
- [Staged delivery plan](docs/plan.md): acceptance criteria and next stages.
- [Architecture](docs/architecture.md): ownership, identity, evaluation, storage and deployment boundaries.
- [Engineering standards](docs/standards.md): BC formatting provenance and toolchain.
- [Feature requirements](docs/conformance/feature-flags/README.md): current observable behavior, not future capabilities.
- [API contract](api/openapi.json), [contributor instructions](AGENTS.md) and [changelog](CHANGELOG.md).

## Next stage

Stage 2 adds explicit typed configuration, ordered targeting rules, segments, environment-scoped overrides, deterministic rollout/variant assignment and a decision playground. A rollout is not an experiment result; actual exposure and measurement have their own later stage.

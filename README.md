# Flightdeck

Enablements and Experiments for Onebrief: feature flags, targeted enablements, controlled rollouts and measured experiments. Independently owned here, with a standalone Onebrief-toolkit UI and a thin Atlas adapter.

## Current status

**Stage 2 — enablements, targeting and typed configuration.** Author boolean, string, number and JSON values; publish ordered targeting rules, reusable segments, scoped subject overrides, deterministic rollouts and weighted variants. Compare current and proposed decisions before publication. The same Onebrief-toolkit pages run standalone and inside Atlas.

This is explicitly local development with synthetic identities and credential-scoped tenant grants, not production authentication, a deployed Atlas service or a real BC integration. Assignment is not experiment exposure or results.

## Run locally

Use Node **26.12.1**, pnpm **11.23.0**, Docker Compose and approved Nexus read access for published Onebrief packages. Keep registry credentials outside this repository.

```sh
pnpm install --frozen-lockfile
pnpm db:setup
pnpm build
pnpm start
```

Open **http://localhost:4721**. Select **Alex Morgan** for administrator access, **Ellis Chen** for editor access or **Vera Singh** for read-only access. All are synthetic local identities. The isolated **Jordan Rivera** identity demonstrates a different organization's scope.

Choose a project under **Projects**. Its Feature flags page is one shared flag inventory with a status column for every environment—not a different flag collection per environment. Click an environment's status to review that configuration; **Configuration environment** determines which configuration opens when you click a flag's name. Creating a flag initializes it disabled everywhere. Enable/configure it independently per environment; metadata and archival apply across the project.

The default **Targeting** tab keeps Boolean flags simple: choose **Everyone** or **Selected audiences**, select existing Flightdeck segments, then review and publish. Any selected segment can qualify; an empty selection matches nobody. BC email, organization and group pickers are visibly unavailable until a real directory connection is built—there is no copied or synthetic BC directory behind them.

Working typed values, ordered rules, rollouts, variants and the playground remain under **Advanced controls**, collapsed by default. Complex existing configurations are preserved and are never automatically converted to the simple editor. Individual overrides remain in **Exceptions (advanced)**. Project targeting catalog owns reusable attributes/segments; publication still explicitly pins their definitions. The Flightdeck and Sandbox names are demo projects, not environments or separate deployments.

### Separate backend consumer

For a flag you created, for example `new-workspace-navigation`:

```sh
pnpm consumer new-workspace-navigation '{"type":"boolean","value":false}' '{"tenantId":"local-tenant","subjectId":"person-0","attributes":{}}'
```

The launcher supplies a private environment-scoped evaluation credential to a separate Node process. Its tenant grant is `local-tenant`. The fallback is explicitly tagged with the expected value type; context is sent by POST. Output distinguishes a validated decision from fallback; authentication/permission failures never become fallback. No evaluation secret is shipped in the frontend. This replaces Stage 1's boolean argument and GET evaluation API.

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

`check` runs Oxlint, frontend/server typechecks, generated OpenAPI consistency, both frontend builds and BC-derived Oxfmt checks. `test` runs the portable evaluator corpus, consumer/session boundary tests and real PostgreSQL/API behavior tests against a separately provisioned test database. Run `pnpm db:setup` first.

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

Stage 3 connects an actual BC backend feature path, establishes authoritative user/tenant mapping and proves delivery failure behavior. Production identity, shared-environment deployment and measured experiments remain separate gates.

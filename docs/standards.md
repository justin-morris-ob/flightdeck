# Engineering standards

## Formatting provenance

Flightdeck follows BC's current Oxfmt conventions, not a new Prettier configuration.

Source checkout: `Onebrief/bc`, commit `142a8fc1b9420d75d46066655279e829f28bf3f5`:

- `AGENTS.md`, formatting rule 22.
- `oxfmt.config.ts`, which imports `bc-oxfmt-config`.
- `packages/bc-oxfmt-config/src/oxfmt.config.ts`, the actual shared settings.
- `packages/bc-oxfmt-config/package.json`, which marks the config package private.
- `pnpm-workspace.yaml`, which specifies Oxfmt `^0.48.0`; the inspected installation resolves to `0.48.0`.
- `docs/conventions/code-style.md`, for transferable TypeScript and component conventions.

The local `oxfmt.config.ts` preserves BC's style settings, import group ordering, internal import patterns, side-effect ordering and package-script sorting. We pin Oxfmt to `0.48.0` for reproducibility. Semicolons use that version's default, as BC does.

BC's config is a private workspace package, not an established published dependency. Flightdeck therefore owns an explicit snapshot instead of a `file:`, symlink or workspace dependency on BC. This snapshot does not automatically follow BC changes. Future updates should compare the canonical BC config and version, record the new source commit, apply intentional differences and rerun formatting verification together.

### Intentional differences

Only ignore paths differ: keep common generated-output exclusions and BC's YAML exclusion, but omit BC-specific fixture, infrastructure and data-directory exclusions. There is no reason to ignore Flightdeck application data or infrastructure wholesale. YAML remains outside this formatter check, just as it is in the inspected BC config; validate deployment and workflow YAML with the appropriate tooling when those surfaces are exercised.

BC's Node 24 application requirement is not a formatting rule. Flightdeck pins Node `26.12.1` and pnpm `11.23.0` to match the independently built Atlas Todo example's known local toolchain. The published Atlas/UX Kit `0.1.0` compatibility set was exercised in Stages 1 and 2; upgrades must recheck the shell's singleton requirements as a set.

## Commands available now

Activate Node through your normal tool manager, or use the committed mise pin:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm fmt
mise exec -- pnpm fmt:check
```

With Node `26.12.1` already active, the equivalent commands are:

```sh
pnpm install --frozen-lockfile
pnpm fmt
pnpm fmt:check
```

The GitHub Actions workflow installs the same Node/pnpm versions, uses the lockfile and runs `pnpm check`, database setup and behavior tests on pull requests and pushes to `main`. A locally passing command does not prove hosted CI has run. CI requires approved Nexus read credentials and a runner with the appropriate network access; see [local development](local-development.md).

Application commands are now real: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm contracts --check`, `pnpm db:setup`, `pnpm start` and `pnpm test`. The backend/scripts use Node's native TypeScript execution; a separate server typecheck enforces erasable syntax, while Vite compiles the published SDK's frontend TypeScript. No source checkout of Atlas or BC is required for install/build/standalone startup.

## Transferable BC conventions

- TypeScript and ES modules; named exports for components; `Props` interfaces for new component props.
- Relative imports within packages and package-name imports between packages.
- Explicit types, string unions instead of new enums, no speculative abstractions.
- Local React state unless a real shared-state requirement justifies another tool.
- Reuse shared Onebrief components and design tokens; no hardcoded theme palette or direct Bootstrap usage.
- Parameterized SQL, explicit authorization, deterministic tests and observable-behavior assertions.

Do not transplant BC's `bc-collab`, ODS workspace imports, account model, Turbo layout or migration machinery into a standalone service merely to match code style. Flightdeck consumes the published Atlas/UX toolkit and owns its own persistence.

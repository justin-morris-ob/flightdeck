# Flightdeck contributor instructions

## Ownership and scope

Flightdeck is an independently owned Enablements and Experiments application. Keep its frontend, backend, schemas, contracts, migrations and deployment package here. Integrate with Atlas through published packages and manifests; do not import source from an Atlas or BC checkout.

Read [the staged plan](docs/plan.md) and [the architecture](docs/architecture.md) before implementation. Complete one stage and report its evidence, limitations and next stage before expanding scope. Planned features are not shipped behavior.

## BC-derived formatting and style

Use Oxfmt, not Prettier. `oxfmt.config.ts` snapshots the formatting rules from BC's private `bc-oxfmt-config`; it is deliberately independent of the BC workspace. Provenance and intentional differences are in [the standards](docs/standards.md).

- Run `pnpm fmt` to format and `pnpm fmt:check` before delivery.
- Use two spaces, single-quoted JavaScript/TypeScript strings, semicolons, a 100-column target and ES5 trailing commas. Let the formatter own import and package-script sorting.
- Use TypeScript, ES modules, named component exports and `Props` for new component props. Prefer string unions to new enums and explicit types to `any`.
- Use relative imports within a package and published package names across packages.
- Prefer functions and straightforward modules over speculative abstractions.
- Use published Onebrief UX Kit and Atlas UI components and shared tokens. Do not copy Unleash components, styling or its component library. Check the installed toolkit's guidance before adding UI.
- BC's collaboration runtime and workspace-only packages are not Flightdeck dependencies merely because its formatting conventions are reused.

## Security and behavior

- Derive actor and control-plane scope from verified identity, never browser-supplied owner headers or a shell display name.
- Authorize every read and mutation. Bind service credentials to explicit projects, environments and operations; never expose them to the browser.
- Use parameterized SQL and separate runtime and migration credentials.
- Keep configuration changes and their audit records atomic. Define concurrent-update behavior before adding writes.
- Never equate a flag evaluation with an experiment exposure or an experiment result.
- Keep secrets, private certificates, local data and generated recordings out of Git.

## Verification and documentation

Stage 2 is a real local application. Run `pnpm check` for lint, frontend/server typechecks, API-contract consistency, both frontend builds and formatting. Run `pnpm db:setup` then `pnpm test` for real PostgreSQL/API behavior, deterministic evaluation vectors and consumer/session boundaries. Follow [local development](docs/local-development.md), [evaluation semantics](docs/evaluation-spec.md) and the [feature requirements](docs/conformance/feature-flags/README.md); do not add placeholder validation scripts.

When introducing implementation, add real build, lint, typecheck and relevant test commands in the same stage. Verify behavior by running the application and exercising the changed path. Use deterministic behavior tests for evaluation boundaries, authorization, persistence and concurrency. Do not test source text or mock forwarding as a substitute for behavior.

Update documentation and the changelog with permanent changes. Report only checks actually run and distinguish local proofs from production guarantees. Never replace an unresolved production integration with a permissive fallback.

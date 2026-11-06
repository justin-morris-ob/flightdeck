# Flightdeck contributor instructions

## Ownership and scope

Flightdeck is an independently owned Enablements and Experiments application. Keep its frontend, backend, schemas, contracts, migrations and deployment package here. Integrate with Atlas through published packages and manifests; do not import source from an Atlas or BC checkout.

Read [the delivery plan](docs/plan.md), [architecture](docs/architecture.md) and [current conformance requirements](docs/conformance/feature-flags/README.md) before implementation. The approved unified redesign replaces the earlier inventory/pinning workflow; preserve historical evidence without presenting it as redesign proof. Planned features and unverified integration are not shipped behavior.

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
- Deployment configuration fixes the local environment; never let browser scope select another writable environment. Master is read-only at the server boundary, including project-only mutation routes.
- Keep flag metadata, lifecycle, archive state and revisions environment-local. Creation starts Off locally only; lifecycle changes never activate gates or publish audiences.
- Keep segment drafts separate from published definitions. Saving/restoring a draft has no live effect; restore requires revision guards and explicit replacement review.
- Segment publication atomically advances all published local references and records their exact impact. Do not bump flag revisions or change gates, direct selections or unrelated drafts. References follow current publication; historical versions are inspection/restore sources, not per-flag pins.
- Match ANY segment block and ALL conditions within a block. Directory selections are alternatives; effective memberships come from trusted consumer context across organizations, guarded by tenant/source. Never query the directory during evaluation.
- Preserve Flags / Segments / Audit trail as peer views; keep settings secondary. Audit is immutable event-time history, not an editing surface or delivery/exposure telemetry.

## Verification and documentation

The local targeting service and consumer lab remain runnable applications; [unified redesign verification](docs/stage-two-verification.md#unified-redesign-verification) records the integrated local checks and browser evidence, not production qualification. Run `pnpm check` for lint, frontend/server typechecks, API-contract consistency, the provider package and standalone/federation/consumer-demo builds, and formatting. Run `pnpm db:setup` then `pnpm test` for real PostgreSQL/HTTP behavior, actual OpenFeature SDK calls, deterministic evaluation and consumer/session boundaries. Follow [local development](docs/local-development.md), [evaluation semantics](docs/evaluation-spec.md) and the [feature requirements](docs/conformance/feature-flags/README.md); do not add placeholder validation scripts.

When introducing implementation, add real build, lint, typecheck and relevant test commands in the same stage. Verify behavior by running the application and exercising the changed path. Use deterministic behavior tests for evaluation boundaries, authorization, persistence and concurrency. Do not test source text or mock forwarding as a substitute for behavior.

The independent provider's `dist/index.js` and `dist/index.d.ts` are tracked release assets for script-free Git consumers. Regenerate them with `pnpm --filter @flightdeck/openfeature-provider build` before publishing a provider commit; do not restore an install-time preparation dependency.

Reusable Flightdeck recording scenarios belong in committed `demo/recordings/*.demo.ts`, not BC's PR-local demo directory. Use the owned presentation fixture and page models, assert real browser outcomes, and run `pnpm demo:record` after `pnpm demo:install` with the local database initialized and ffmpeg available. Keep generated artifacts under ignored `.local/demos/` and do not import BC harness source.

Update documentation and the changelog with permanent changes. Report only checks actually run and distinguish local proofs from production guarantees. Never replace an unresolved production integration with a permissive fallback.

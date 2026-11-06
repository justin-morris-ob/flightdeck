# Stage 1 verification record

Historical evidence only: this original boolean/project-wide workflow predates typed targeting and the unified redesign. Preserve the executions below as recorded; they are not proof of current local lifecycle, fixed-environment or segment-following behavior. See the separate [unified verification](stage-two-verification.md#unified-redesign-verification) for replacement evidence.

Verified locally on 2026-11-04. This is evidence for the local boolean-flag vertical slice, not production readiness. See [local development](local-development.md) for reproducible startup and [requirements](conformance/feature-flags/requirements/stage-one.md) for the observable contract.

## Toolchain and compatibility

Node `26.12.1`, pnpm `11.23.0`, PostgreSQL 17 through the dedicated Compose service; Atlas SDK/UI/BFF/Vite/shell-contract `0.1.0`, UX Kit `0.1.0`, React/React DOM `19.2.7`, Vite `8.2.1`, TypeScript `6.0.3`. The standalone build uses the matching React Vite plugin `6.0.1`.

The separate Atlas shell was run from the checkout at `d7005481cefb2668d56b780137f2429f7cc094af`, with its existing build. Its source was not changed for Flightdeck integration. Flightdeck's install, build and standalone startup use its own source and published packages, not Atlas/BC workspace imports.

## Commands exercised

Commands were run through `mise exec node@26.12.1 --`:

| Command                                        | Observed result                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`               | Passed with the application dependency lockfile                                                                                                                                |
| `pnpm db:setup`                                | Provisioned a new dedicated PostgreSQL volume, both application/test databases, roles, migrations and synthetic scope; a repeat setup passed without clearing application data |
| `pnpm check`                                   | Oxlint, frontend and native-server typechecks, generated OpenAPI consistency, standalone/federation builds and Oxfmt check passed                                              |
| `pnpm test`                                    | 15 tests passed in 2 files against real PostgreSQL and local-session trust boundaries                                                                                          |
| `pnpm start`                                   | Actual service bound to `127.0.0.1:4721`; standalone UI/API and built remote assets served                                                                                     |
| `pnpm consumer new-workspace-navigation false` | Separate Node process returned `source: decision`, `value: true`, `reason: enabled`, `revision: 5` for the UI-authored flag                                                    |
| `ATLAS_CHECKOUT=../atlas pnpm shell`           | Started the existing compatible shell on port 4720 with Flightdeck discovery enabled                                                                                           |
| Production-mode local startup                  | Exited 1 with explicit refusal before launching the server                                                                                                                     |

The original aggregate check surfaced a missing standalone React build-plugin dependency and an inappropriate shared erasable-syntax restriction on the SDK's frontend source. The plugin is now explicit; strict native erasable syntax is enforced by a separate server typecheck while Vite compiles the frontend SDK. The corrected checks passed; the failing attempts were not counted as successful verification.

## Actual HTTP and consumer smoke

A temporary local script drove the real running HTTP server and imported backend consumer, rather than invoking mocked routes. It exercised:

- Signed HttpOnly/SameSite local sessions; unauthenticated management rejection; untrusted-origin rejection.
- Viewer write rejection and cross-organization resource non-enumeration.
- Create, duplicate key, invalid JSON and bounded request-body behavior.
- Two simultaneous writes from the same revision: one 200, one 409; only one successful audit increment.
- Environment isolation, service-only evaluation, wrong-scope 403, invalid credential 401 and unknown key 404.
- Explicit not-found and unavailable-service fallback; permission failures throw instead of falling back.
- Credential issuance, successful scoped use, revocation and subsequent evaluation rejection.
- Archive false/archived decision and restoration of retained enabled state.

The script passed, and the backend process was stopped and launched again. The same flag decision and revision remained. Temporary smoke source/results were not retained as product code; permanent tests cover the database, authorization, concurrency, atomic rollback, query boundaries, credential verifiers, runtime privileges and signed-session cases.

## Actual browser walkthroughs

### Standalone — http://localhost:4721

Using the published Onebrief shell/content components:

1. Signed in as the synthetic administrator.
2. Created `new-workspace-navigation` through the real form.
3. Enabled Development; observed a true decision and an actor-attributed activity entry.
4. Switched to simulated Production and observed its unchanged disabled configuration.
5. Edited metadata, archived and restored the flag, observing the expected revisions and retained state.
6. Visually inspected dark and light themes.
7. Restarted the backend, reloaded the browser, reopened the flag and observed its retained state and revision 5.
8. Opened the create dialog by keyboard, closed it with Escape, searched inventory and observed a real filtered result and an empty-result state.

### Separate Atlas shell — http://localhost:4720

1. Signed into the existing demo shell and discovered Flightdeck from its generated manifest.
2. Opened Feature flags through SDK navigation at `/flightdeck/flags/all`; the real persisted inventory and detail page loaded without a second application shell.
3. Visually inspected the shared page in both shell themes and observed the same configuration/audit-backed decisions.
4. Signed out of Flightdeck without signing out the Atlas shell, then selected the synthetic viewer. The viewer could inspect data but did not receive edit/toggle/archive controls.
5. Switched back to the administrator, issued an environment-scoped evaluation credential, confirmed no token was persisted in browser storage, closed its one-time display and revoked it through the UI.

Federation smoke initially exposed two real integration errors: the SDK already prefixes paths with `/api`, and root-serving a remote entry moved its relative imports to the standalone assets directory. The adapter now supplies API-relative paths; the application-root entry redirects to `/remote/remoteEntry.js` so its chunks resolve from their actual remote directory. The corrected module loaded in the unmodified shell. No Atlas source workaround was applied.

## What this does not prove

- Production sign-in, membership/role delegation, service workload identity, production tenant isolation or a BC-account-to-subject mapping. The role/scope checks exercised here use synthetic local identities.
- A BC browser/backend integration. The consumer is a separate example Node process, not BC.
- Container-image execution, Helm/UDS deployment, artifact publication, hosted CI/network readiness, production migrations, secret rotation policy, backups, restore or operational recovery.
- Targeting rules, segments, percentage rollout, variants, experimentation exposure, metrics or statistical results.
- A complete accessibility audit or every responsive viewport. Actual desktop themes, accessible form labels and a keyboard dialog path were exercised.

The local database and service processes are development resources only. [The onboarding record](local-development.md#onboarding-record-and-remaining-external-gates) names the remaining ownership boundaries and prerequisites. Stage 2 is the next product stage; none of its capabilities are implied by this checkpoint.

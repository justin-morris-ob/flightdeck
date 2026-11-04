# Stage 1 observable requirements

## §1 Scope and identity

- **§1.1** Startup requires explicit local-development mode, binds to loopback and refuses production mode. The browser identifies the environment as synthetic development.
- **§1.2** A local operator's role and organization come from server-owned identity configuration, not request-provided role/organization claims or the Atlas display name. A tampered or expired session does not authorize management.
- **§1.3** Viewers may read configuration, activity and evaluation preview but cannot mutate flags or manage credentials. Editors may mutate flags but cannot manage credentials. Administrators may issue/revoke evaluation credentials only in their authorized organization/project/environment.
- **§1.4** Inaccessible operator resource scopes return 404. A service credential used outside its project/environment returns 403 before resource lookup. Service credentials cannot manage flags or enumerate management data.

## §2 Configuration and persistence

- **§2.1** Flag keys are immutable and unique within a project, including archived flags. Creation initializes disabled configuration in every environment of that project.
- **§2.2** Enabled state is environment-specific; metadata, archive state and revision are project-wide. Changing enabled state in development does not change production's configured value.
- **§2.3** Each successful mutation atomically publishes the next global revision and an actor-attributed audit entry containing allowlisted before/after state and the change environment. A rejected/conflicting write publishes neither a revision nor a success event.
- **§2.4** A mutation must supply its expected global revision. Exactly one concurrent mutation against the same starting revision may succeed; the other receives a conflict rather than overwriting the winner.
- **§2.5** Flag identity, configuration and audit history survive backend process restart. Owner-run migrations track checksums and may repeat without clearing application data. Runtime cannot perform schema-owner operations or mutate existing audit records.
- **§2.6** Inventory and history enforce bounded cursor pagination. Inputs are validated and SQL values parameterized; an invalid input does not publish a partial change.

## §3 Evaluation and credentials

- **§3.1** A known active flag evaluates its selected environment's boolean state and returns the immutable key, scope, reason and current revision. Unknown keys return 404, not an ordinary false result.
- **§3.2** An archived flag evaluates false with reason archived in every environment. Archive preserves underlying configuration and audit history; restore reinstates that configuration. Enabling while archived is rejected.
- **§3.3** Issuance reveals a scoped evaluation secret once. Only its verifier persists. Lists do not expose it, the UI does not persist it in browser storage, and revocation prevents further evaluation with it.
- **§3.4** The separate backend client validates response key/scope/value/revision and uses a finite timeout. A fallback is explicitly chosen by the consumer and distinguished from a successful decision. A 401/403 authorization failure throws instead of applying that fallback.
- **§3.5** Evaluation is not recorded as experiment exposure and is not an authorization/entitlement decision.

## §4 Operator UI and Atlas

- **§4.1** The standalone UI can create, inspect, edit, enable/disable, archive/restore and inspect activity for real persisted flags using Onebrief toolkit components and tokens in dark/light themes. Confirmation identifies the affected scope, including project-wide archival and simulated production changes.
- **§4.2** Permission-appropriate controls, keyboard-reachable forms, loading, empty, validation, conflict and request-error states are visible. A failed write must not appear successful.
- **§4.3** Independently built published-package federation assets expose the same application pages through a separately configured, unmodified compatible Atlas shell. Embedded pages do not render a second shell.
- **§4.4** Atlas demo sign-in does not grant Flightdeck authorization. Establishing/clearing Flightdeck's explicit local session is independent of Atlas sign-in, and an absent local session can be discovered without signing out the shell.

## Evidence mapping

Database/scope/concurrency/credential behavior: `server/routes.test.ts`. Session trust boundaries: `server/auth.test.ts`. Actual HTTP, separate consumer, restart, standalone/Atlas browser and theme scenarios are recorded in the verification document; they are not implied by a passing unit test.

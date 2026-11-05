# Project scope and navigation verification

## POC subtraction pass

The current visible UI is Flags, Segments and an explicitly unimplemented Audit log placeholder. See [local development](local-development.md#projects-and-the-shared-flag-inventory) for the reduced surface.

Observed checks: `pnpm check`, `pnpm db:setup`, and `pnpm test` passed; 261 tests across eight files. Location coverage now exercises project-wide Segments/Audit log and rejection of retired catalog/credential UI locations. Backend contracts, database schema and evaluation code are unchanged in this pass.

Actual browser scenarios used isolated standalone and unmodified Atlas-shell previews. Writes were limited to a newly created synthetic flag and segment:

- Created a flag; both environment gates initially showed Off.
- Changed Development availability, saved an empty Selected segments audience, reloaded, and observed the selection persist. Production remained independently Off with Everyone until explicitly preparing its separate advanced fixture.
- A dirty environment transition offered Stay, which retained both selected environment and audience draft.
- Created and edited a focused segment. HTTP comparison confirmed attributes and all pre-existing segments were preserved. Escape/Stay retained an edited name; save survived reload.
- A concurrent write to the owned segment made the stale form save fail with a revision conflict while retaining its draft. The analogous flag-publication conflict retained the reviewed audience and did not falsely report success.
- Held a real preview request pending: attempted section navigation was blocked by Save in progress, and completing validation opened the correct environment confirmation.
- Prepared a string configuration on the owned flag through its existing authorized API. The UI exposed no simple audience radios; changing availability preserved its entire stored configuration.
- Verified viewer creation/save controls absent and segment inspection read-only.
- Opened all three sections through actual Atlas object references, including the truthful Audit log placeholder; no page errors were reported.
- Visually inspected standalone dark/light and an 800px viewport, with the project selector and three sections visible.

The following FD-UX-01 evidence predates this subtraction pass and does not assert that retired controls remain present.

## Historical FD-UX-01

FD-UX-01 clarifies administrative organization → project → shared flag → environment configuration. It does not change targeting evaluation or introduce initiative-sized projects.

### Automated checks

- `pnpm check`: lint, browser/server type checks, runtime/OpenAPI agreement, standalone/remote/consumer builds and formatting.
- `pnpm test`: 258 tests across eight files, against the dedicated local test database. New coverage exercises organization resolution on session-producing HTTP paths, missing-organization rejection, operator-only project overview reads, organization isolation, stored/missing environment configurations, and standalone/Atlas location validation.

### Actual browser scenarios exercised

The standalone build and a separately installed, unmodified Atlas shell were run on isolated loopback ports. All mutations used a newly created synthetic flag; existing flag configuration and catalog records were not changed.

- Created a flag from project inventory; creation opened the project overview and both environment gates were Off.
- Opened overview directly and reloaded it. Network inspection showed one project flag summary read and no full environment flag configuration reads.
- Opened Development explicitly. Attempted an environment change with unpublished targeting edits: Stay retained both the Development location and draft. Activity/Targeting inspection retained the draft.
- Used native browser Back with dirty targeting: Stay restored the current URL/draft; Discard and leave reached overview without an environment query.
- Went overview → configuration → Back → reload. The app's Forward control remained enabled and reached the exact configuration.
- Searched inventory, visited overview, returned, and observed the same search. In Atlas, Back returned to the originating `flags/all` object rather than creating another inventory; returning after a metadata write refreshed its owner/version summary.
- Edited the catalog without saving. Project change prompted; Stay retained project and draft. Switching to inventory required explicit discard. No catalog write was made.
- Edited a create form and pressed Escape: Stay retained the form value; a second Escape followed by Discard closed it without creation.
- Saved shared metadata and published reviewed targeting to Development on the owned synthetic flag. Navigation afterward did not produce a false unsaved-change prompt.
- Opened overview as the viewer (no metadata controls). Opened the main organization's direct link as the isolated organization administrator: explicit unavailable-project state, with no fallback to a different project.
- Visually inspected dark and light themes, the embedded composition, and the Project selector at an 800px viewport. The standalone browser reported no page errors during these scenarios.

## Explicit limits

Native unload warning behavior depends on browser support; this is not draft recovery. The published Atlas SDK has no host-tab-close veto, so Flightdeck guards its own scope-changing actions but cannot prevent the shell closing an app tab. Shell chrome may show an unrelated demo project; only the Flightdeck scope bar establishes the application project and administrative organization.

This evidence does not claim SDK propagation, production authentication, production deployment, or completion of FD-UX-02 and later slices.

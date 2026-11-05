import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

import { z } from 'zod';

import { flagSchema, type Flag } from '../../shared/contracts.ts';
import {
  directoryBindingSchema,
  directoryConditions,
  directorySearchSchema,
  directoryStatusSchema,
} from '../../shared/directory.ts';
import { readSimpleAudience, setSimpleAudience } from '../../shared/simple-targeting.ts';
import { catalogSchema, configurationInput } from '../../shared/targeting.ts';
import { BCDirectoryPage } from './bc-directory-page.ts';
import { startDirectoryRelay, validateBCOrigin, type DirectoryRelay } from './directory-relay.ts';
import { expect, test as base } from './harness.ts';

const flightdeckOrigin = 'http://localhost:4721';
const configSchema = z.strictObject({
  bcOrigin: z.string().transform((value) => validateBCOrigin(value, 4740)),
  bcBackendOrigin: z.string().transform((value) => validateBCOrigin(value, 4741)),
  username: z.string().min(1).max(254),
  password: z.string().min(1).max(1024),
  projectId: z.literal('20000000-0000-4000-8000-000000000001'),
  environmentId: z.literal('30000000-0000-4000-8000-000000000001'),
  flagKey: z.literal('bc-homepage-title-filter'),
  tenantId: directoryBindingSchema.shape.tenantId,
  sourceId: directoryBindingSchema.shape.sourceId,
  groupId: z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .refine((id) => Number.isSafeInteger(Number(id))),
  groupName: z.string().min(2).max(128),
});
type BCDemoConfig = z.infer<typeof configSchema>;

async function readPrivateConfig(path: string): Promise<BCDemoConfig> {
  let file: FileHandle | undefined;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== process.getuid?.() ||
      stat.size > 64 * 1024
    ) {
      throw new Error('Invalid private configuration file.');
    }
    return configSchema.parse(JSON.parse(await file.readFile('utf8')));
  } catch {
    // Schema/file errors can contain supplied values or private paths: never report their cause.
    throw new Error(
      'BC demo config must be an owned, regular 0600 JSON file with valid local fields.'
    );
  } finally {
    await file?.close();
  }
}

const test = base.extend<{ bcDirectory: { config: BCDemoConfig; relay: DirectoryRelay } }>({
  bcDirectory: async ({ page: _page }, use) => {
    const path = process.env.FLIGHTDECK_BC_DEMO_CONFIG;
    if (!path) throw new Error('BC directory demo requires explicit private configuration.');
    const config = await readPrivateConfig(path);
    const relay = await startDirectoryRelay(config.bcBackendOrigin);
    try {
      await use({ config, relay });
    } finally {
      await relay.close();
    }
  },
});

test.use({ trace: 'off', screenshot: 'off' });
test.skip(!process.env.FLIGHTDECK_BC_DEMO_CONFIG, 'Opt in with FLIGHTDECK_BC_DEMO_CONFIG.');
test.setTimeout(180_000);

test('should author a real BC group and evaluate through an authoring outage', async ({
  page,
  demo,
  bcDirectory: { config, relay },
}) => {
  const ui = new BCDirectoryPage(page);
  const scope = `/api/v1/projects/${config.projectId}/environments/${config.environmentId}`;
  const flagPath = `${scope}/flags/${config.flagKey}`;
  const target = {
    sourceId: config.sourceId,
    tenantId: config.tenantId,
    kind: 'groups' as const,
    ids: [config.groupId],
  };
  const readFlag = async () => {
    const response = await page.request.get(`${flightdeckOrigin}${flagPath}`);
    expect(response.status()).toBe(200);
    return flagSchema.parse(await response.json());
  };
  const readCatalog = async () => {
    const response = await page.request.get(`${flightdeckOrigin}${scope}/catalog`);
    expect(response.status()).toBe(200);
    return catalogSchema.parse(await response.json());
  };
  const openFlag = async () => {
    await page.goto(flightdeckOrigin);
    await ui.project.selectOption(config.projectId);
    await ui.environment.selectOption(config.environmentId);
    await ui.flagSearch.fill(config.flagKey);
    await demo.click(ui.flag(config.flagKey));
  };
  let evaluatedAccountUuid: string | undefined;
  const expectBCDecision = async (value: boolean, navigate: () => Promise<unknown>) => {
    const pending = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        [config.bcOrigin, config.bcBackendOrigin].includes(url.origin) &&
        url.pathname === '/api/feature-flags/values' &&
        response.request().method() === 'GET'
      );
    });
    await navigate();
    const response = await pending;
    expect(response.status()).toBe(200);
    const payload: unknown = await response.json();
    const bootstrap = z
      .object({
        values: z.object({ HOMEPAGE_CARDS_SHARED_TEXT_FILTER: z.literal(value) }),
        context: z
          .object({
            accountUuid: z.uuid(),
            orgIds: z.array(z.number()),
            groupIds: z.array(z.number()),
          })
          .passthrough(),
      })
      .parse(payload);
    if (evaluatedAccountUuid) expect(bootstrap.context.accountUuid).toBe(evaluatedAccountUuid);
    evaluatedAccountUuid = bootstrap.context.accountUuid;
    expect(bootstrap.context.groupIds).toContain(Number(config.groupId));
    expect(Object.hasOwn(bootstrap.context, 'flightdeck')).toBe(false);
    await expect(ui.userMenu).toBeVisible();
    const titleFilter = ui.titleFilter;
    if (value) {
      await expect(ui.titleFilterSection).toBeVisible();
      await expect(titleFilter).toBeVisible();
    } else {
      await expect(ui.titleFilterSection).toHaveCount(0);
      await expect(titleFilter).toHaveCount(0);
    }
  };

  await page.goto(flightdeckOrigin);
  await demo.click(ui.localAdministrator);
  const initial = await readFlag();
  const catalog = await readCatalog();
  if (
    !initial.enabled ||
    initial.archived ||
    initial.owner !== 'Flightdeck directory demo' ||
    !initial.description.includes('[flightdeck-bc-directory-demo]') ||
    !readSimpleAudience(initial.configuration) ||
    initial.configuration.catalogRevision !== catalog.revision
  ) {
    throw new Error(
      'Use a dedicated enabled, unarchived simple Boolean flag pinned to the current catalog.'
    );
  }
  let lastOwned: Flag | null = null;
  let scenarioFailure: { cause: unknown } | undefined;
  try {
    // Public, session-authenticated setup makes the ensuing UI selection unambiguous.
    const empty = setSimpleAudience(
      configurationInput(initial.configuration),
      { mode: 'selected', segmentIds: [], directoryTargets: [] },
      catalog.segments,
      () => crypto.randomUUID()
    );
    const setup = await page.request.put(`${flightdeckOrigin}${flagPath}/configuration`, {
      data: {
        expectedRevision: initial.revision,
        expectedCatalogRevision: catalog.revision,
        configuration: empty,
      },
    });
    expect(setup.status()).toBe(200);
    lastOwned = flagSchema.parse(await setup.json());
    await page.goto(config.bcOrigin);
    await demo.caption(
      'NEGATIVE CONTROL · Sign into the isolated BC account while Flightdeck has no selected audience. The same account must receive false and no title filter before this demo authors its group.'
    );
    try {
      await ui.username.fill(config.username);
      await expect(ui.password).toHaveAttribute('type', 'password');
      await ui.password.fill(config.password);
      await ui.signIn.click();
    } catch {
      throw new Error('BC UI sign-in failed; private credential diagnostics were suppressed.');
    }
    await expect(ui.userMenu).toBeVisible();
    await expectBCDecision(false, () => page.reload());
    await demo.pause();
    await openFlag();
    await demo.chapter(
      'Real BC directory → owned Flightdeck targeting',
      'An isolated local BC tenant supplies real group names and stable IDs. Flightdeck owns targeting; this is not production identity or deployment evidence.'
    );
    await expect(ui.selectedAudience).toBeChecked();
    await expect(ui.emptyAudience).toBeVisible();
    const statusResponse = await page.request.get(`${flightdeckOrigin}${scope}/directory`);
    expect(statusResponse.status()).toBe(200);
    expect(directoryStatusSchema.parse(await statusResponse.json())).toMatchObject({
      status: 'configured',
      binding: { sourceId: config.sourceId, tenantId: config.tenantId },
    });
    await demo.caption(
      'AUTHORING · Search the actual BC group directory. This selection saves stable tenant, source and group predicates—not a replicated membership list.'
    );
    await demo.fill(ui.groupSearch, config.groupName);
    const searchPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${scope}/directory/search` &&
        new URL(response.url()).searchParams.get('kind') === 'groups'
    );
    await demo.click(ui.searchGroups);
    const searchResponse = await searchPending;
    expect(searchResponse.status()).toBe(200);
    const result = directorySearchSchema.parse(await searchResponse.json());
    expect(result).toMatchObject({
      sourceId: config.sourceId,
      tenantId: config.tenantId,
      kind: 'groups',
    });
    expect(result.items).toContainEqual({
      id: config.groupId,
      label: config.groupName,
      email: null,
    });
    expect(
      relay.forwardedRequests.get('GET /api/external/flightdeck-directory/v1/search')
    ).toBeGreaterThan(0);
    await demo.click(ui.addGroup(config.groupName));
    await expect(ui.selectedGroups).toContainText(config.groupName);
    await demo.click(ui.reviewTargeting);
    await expect(ui.proposedAudience).toBeVisible();
    await demo.pause();
    await demo.click(ui.reviewPublication);
    const publishPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${flagPath}/configuration` &&
        response.request().method() === 'PUT'
    );
    await demo.click(ui.confirmPublication);
    const published = await publishPending;
    expect(published.status()).toBe(200);
    lastOwned = flagSchema.parse(await published.json());
    expect(readSimpleAudience(lastOwned.configuration)).toEqual({
      mode: 'selected',
      segmentIds: [],
      directoryTargets: [target],
    });
    expect(lastOwned.configuration.rules).toHaveLength(1);
    expect(lastOwned.configuration.rules[0]?.conditions).toEqual(directoryConditions(target));

    const beforeEvaluation = [...relay.forwardedRequests.entries()];
    await expectBCDecision(true, () => page.goto(config.bcOrigin));
    expect([...relay.forwardedRequests.entries()]).toEqual(beforeEvaluation);
    await demo.caption(
      'LIVE BC · A successful true bootstrap enables the real homepage title filter. BC supplies authenticated effective memberships; no directory lookup occurs during evaluation.'
    );
    const titleFilter = ui.titleFilter;
    await demo.fill(titleFilter, 'Flightdeck');
    await expect(titleFilter).toHaveValue('Flightdeck');
    await demo.pause();
    await titleFilter.fill('');

    await relay.close();
    await openFlag();
    await demo.caption(
      'REAL NETWORK OUTAGE · The demo-owned authoring relay is stopped. BC remains live separately. Existing saved targeting is preserved; new directory searches must show unavailable.'
    );
    await demo.fill(ui.groupSearch, config.groupName);
    const unavailablePending = page.waitForResponse(
      (response) => new URL(response.url()).pathname === `${scope}/directory/search`
    );
    await demo.click(ui.searchGroups);
    expect((await unavailablePending).status()).toBe(503);
    await expect(ui.unavailableDirectory).toBeVisible();
    await expect(ui.selectedGroups).toContainText(config.groupId);
    const savedDuringOutage = await readFlag();
    expect(savedDuringOutage).toEqual(lastOwned);
    await demo.pause(3500);
    await expectBCDecision(true, () => page.goto(config.bcOrigin));
    await expectBCDecision(true, () => page.reload());
    expect([...relay.forwardedRequests.entries()]).toEqual(beforeEvaluation);
    await demo.caption(
      'INDEPENDENT EVALUATION · With the authoring relay still stopped and BC still up, a fresh successful true bootstrap keeps the actual title filter visible. No directory lookup is required during evaluation.'
    );
    await demo.point(ui.titleFilter);
    await demo.pause(4500);
    await demo.clearCaption();
  } catch (cause) {
    scenarioFailure = { cause };
  }
  try {
    if (lastOwned) {
      const current = await readFlag();
      const currentCatalog = await readCatalog();
      if (
        JSON.stringify(current) !== JSON.stringify(lastOwned) ||
        JSON.stringify(currentCatalog) !== JSON.stringify(catalog)
      ) {
        throw new Error(
          'Demo cleanup refused a concurrent flag/catalog change; dedicated flag was not overwritten.'
        );
      }
      const restored = await page.request.put(`${flightdeckOrigin}${flagPath}/configuration`, {
        data: {
          expectedRevision: current.revision,
          expectedCatalogRevision: catalog.revision,
          configuration: configurationInput(initial.configuration),
        },
      });
      expect(restored.status(), 'Restore the dedicated flag using optimistic revision guards').toBe(
        200
      );
      expect(flagSchema.parse(await restored.json()).configuration).toEqual(initial.configuration);
    }
  } catch (cleanupFailure) {
    if (scenarioFailure)
      throw new AggregateError(
        [scenarioFailure.cause, cleanupFailure],
        'BC directory scenario failed and guarded restoration also failed.'
      );
    throw cleanupFailure;
  }
  if (scenarioFailure) throw scenarioFailure.cause;
});

import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';

import {
  evaluationSchema,
  flagSchema,
  previewSchema,
  scopePath,
  type Flag,
} from '../../shared/contracts.ts';
import { localEnvironments, localProjects } from '../../shared/fixtures.ts';
import { readSimpleAudience, setSimpleAudience } from '../../shared/simple-targeting.ts';
import { catalogSchema, configurationInput } from '../../shared/targeting.ts';
import {
  auditTrailSchema,
  deploymentSchema,
  segmentLibrarySchema,
  segmentRecordSchema,
  type SegmentRecord,
} from '../../shared/unified.ts';
import { demoConfigSchema, type DemoConfig } from '../consumer/contracts.ts';
import { expect, test } from './harness.ts';
import { UnifiedDesignPage } from './unified-design-page.ts';

const origin = 'http://localhost:4721';
const owner = 'Flightdeck unified design demo';
const marker = '[flightdeck-unified-design-demo]';

// Evaluation secrets stay in this Node worker, never the browser, captions, attachments or trace.
async function readEvaluatorConfig(): Promise<DemoConfig> {
  let file: FileHandle | undefined;
  try {
    const path = process.env.FLIGHTDECK_UNIFIED_DEMO_CONFIG;
    if (!path) throw new Error('Missing private evaluator configuration.');
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== process.getuid?.() ||
      stat.size > 64 * 1024
    )
      throw new Error('Invalid private evaluator configuration.');
    const config = demoConfigSchema.parse(JSON.parse(await file.readFile('utf8')));
    const project = localProjects.find((item) => item.key === 'sandbox')!;
    const environment = localEnvironments.find(
      (item) => item.projectId === project.id && item.key === 'development'
    )!;
    if (
      config.baseUrl !== origin ||
      config.projectId !== project.id ||
      config.environmentId !== environment.id
    )
      throw new Error('Wrong private evaluator scope.');
    return config;
  } catch {
    throw new Error(
      'Unified demo requires an owned regular 0600 consumer-demo config for loopback Sandbox / Development. Private diagnostics suppressed.'
    );
  } finally {
    await file?.close();
  }
}

test.skip(
  process.env.FLIGHTDECK_UNIFIED_DEMO !== '1',
  'Opt in with FLIGHTDECK_UNIFIED_DEMO=1 and FLIGHTDECK_UNIFIED_DEMO_CONFIG.'
);
test.use({ trace: 'off', screenshot: 'off' });
test.setTimeout(240_000);

test('should publish following segments and restore history only as a draft', async ({
  page,
  demo,
}, testInfo) => {
  const config = await readEvaluatorConfig();
  const ui = new UnifiedDesignPage(page);
  const scope = scopePath(config.projectId, config.environmentId);
  const suffix = crypto.randomUUID();
  const flagKey = `unified-demo-${suffix}`;
  const segmentKey = `unified-audience-${suffix}`;
  const segmentName = `Unified demo audience ${suffix.slice(0, 8)}`;
  const subjectId = crypto.randomUUID();
  const excludedSubjectId = crypto.randomUUID();
  const flagPath = `${scope}/flags/${flagKey}`;
  let segment: SegmentRecord | undefined;
  let initial: Flag | undefined;
  let flagRestored = false;
  let lastOwned: Flag | undefined;
  let scenarioFailure: { cause: unknown } | undefined;

  const management = async (path: string, method = 'GET', data?: unknown) => {
    const response = await page.request.fetch(`${origin}${path}`, {
      method,
      ...(data ? { data } : {}),
    });
    expect(response.status(), `${method} ${path}`).toBe(200);
    return response.json();
  };
  const readFlag = async () => flagSchema.parse(await management(flagPath));
  const readCatalog = async () => catalogSchema.parse(await management(`${scope}/catalog`));
  const readSegment = async () => {
    const library = segmentLibrarySchema.parse(await management(`${scope}/segments`));
    const found = library.items.find((item) => item.id === segment?.id && item.key === segmentKey);
    if (!found || found.description !== marker)
      throw new Error('Demo-owned segment identity changed; refusing to continue.');
    return found;
  };
  const evaluate = async (expected: boolean, revision: number) => {
    const response = await fetch(`${origin}${scope}/evaluate/${flagKey}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ context: { tenantId: config.tenantId, subjectId, attributes: {} } }),
    });
    expect(response.status, 'Real evaluation-only service credential').toBe(200);
    const decision = evaluationSchema.parse(await response.json());
    expect(decision).toMatchObject({
      key: flagKey,
      projectId: config.projectId,
      environmentId: config.environmentId,
      enabled: true,
      revision,
      value: { type: 'boolean', value: expected },
      reason: expected ? 'rule' : 'default',
    });
  };
  const openFlag = async () => {
    await demo.click(ui.section('Flags'));
    await demo.fill(ui.flagSearch, flagKey);
    const searchPending = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === `${scope}/flags` &&
        url.searchParams.get('search') === flagKey &&
        response.request().method() === 'GET'
      );
    });
    await ui.flagSearch.press('Enter');
    const searchResponse = await searchPending;
    expect(searchResponse.status()).toBe(200);
    await searchResponse.finished();
    await expect(ui.inventoryLoading).toHaveCount(0);
    await demo.click(ui.flag(flagKey));
    await expect(ui.publishedBehavior).toBeVisible();
    await expect(ui.audienceEditor).not.toBeVisible();
  };
  const openSegment = async () => {
    await demo.click(ui.section('Segments'));
    await demo.fill(ui.segmentSearch, segmentKey);
    await demo.click(ui.button(segmentName));
  };
  const publishSegment = async () => {
    if (!segment) throw new Error('Missing owned segment.');
    await demo.click(ui.button('Review changes'));
    await expect(ui.dialog).toContainText('Before ·');
    await expect(ui.dialog).toContainText('Affected published references · Development');
    const pending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${scope}/segments/${segment!.id}/publish` &&
        response.request().method() === 'POST'
    );
    await demo.click(ui.dialogButton('Publish segment to Development'));
    const response = await pending;
    expect(response.status()).toBe(200);
    segment = segmentRecordSchema.parse(await response.json());
  };
  const reviewAudience = async () => {
    const validationPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${flagPath}/preview` &&
        response.request().method() === 'POST'
    );
    await demo.click(ui.reviewChanges);
    const validationResponse = await validationPending;
    expect(validationResponse.status(), 'Server validates the audience draft before review').toBe(
      200
    );
    expect(previewSchema.parse(await validationResponse.json()).proposed).not.toBeNull();
    await expect(ui.targetingReview).toBeVisible();
    await expect(ui.dialog).toHaveCount(1);
    await expect(ui.currentAudience).toBeVisible();
    await expect(ui.proposedAudience).toBeVisible();
    await expect(ui.targetingReview).toContainText('Sandbox / Development');
    await expect(ui.targetingReview).toContainText(segmentName);
  };

  try {
    await page.goto(origin);
    await demo.click(ui.administrator);
    await expect(ui.project).toBeEnabled();
    await demo.select(ui.project, config.projectId);
    expect(deploymentSchema.parse(await management('/api/v1/deployment'))).toMatchObject({
      mode: 'local',
      environmentKey: 'development',
    });
    await expect(ui.environmentSelector).toHaveCount(0);
    await expect(ui.fixedEnvironment).toBeVisible();
    await demo.chapter(
      'One published audience. Every reference follows.',
      'Real local Development data and synthetic evaluation context. A segment draft is not live; publication is explicit. Each run owns disposable records and retains their immutable audit history.'
    );

    await demo.caption(
      'FULL-PAGE CREATION · Keep project and Development visible. New flags start Off in this environment only; creating a flag does not publish an audience.'
    );
    await demo.click(ui.button('Create flag'));
    await expect(page.getByRole('heading', { name: 'Create flag', exact: true })).toBeVisible();
    await expect(ui.dialog).toHaveCount(0);
    await expect(ui.project).toBeVisible();
    await expect(ui.fixedEnvironment).toBeVisible();
    const flagForm = page.locator('.fd-creation-screen form');
    await demo.fill(
      flagForm.getByRole('textbox', { name: 'Name', exact: true }),
      `Unified demo flag ${suffix.slice(0, 8)}`
    );
    await expect(flagForm.getByRole('textbox', { name: 'Flag key', exact: true })).toHaveValue(
      `unified_demo_flag_${suffix.slice(0, 8)}`
    );
    await demo.fill(flagForm.getByRole('textbox', { name: 'Flag key', exact: true }), flagKey);
    await demo.fill(
      flagForm.getByRole('textbox', { name: 'Name', exact: true }),
      `Unified demo flag ${suffix.slice(0, 8)} preview`
    );
    await expect(flagForm.getByRole('textbox', { name: 'Flag key', exact: true })).toHaveValue(
      flagKey
    );
    await demo.caption(
      'LIFECYCLE BY INTENT · Delivery flags are temporary; System and Permissions are long-lived. The key follows Name until customized. Lifecycle never turns the flag On.'
    );
    await demo.click(
      flagForm.getByText('Ongoing operational behavior or system control.', { exact: true })
    );
    await demo.fill(flagForm.getByRole('textbox', { name: 'Owner', exact: true }), owner);
    await flagForm.getByRole('textbox', { name: 'Description', exact: true }).fill(marker);
    const flagPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${scope}/flags` &&
        response.request().method() === 'POST'
    );
    await demo.click(flagForm.getByRole('button', { name: 'Create flag', exact: true }));
    const flagResponse = await flagPending;
    expect(flagResponse.status()).toBe(200);
    initial = flagSchema.parse(await flagResponse.json());
    expect(initial.lifecycle).toBe('system');
    await expect(ui.publishedBehavior).toBeVisible();
    await expect(ui.dialog).toHaveCount(0);
    if (
      initial.key !== flagKey ||
      initial.owner !== owner ||
      initial.description !== marker ||
      initial.enabled ||
      initial.archived
    )
      throw new Error('New demo flag ownership or initial gate is unexpected; refusing mutations.');
    lastOwned = initial;
    const catalog = await readCatalog();
    lastOwned = flagSchema.parse(
      await management(`${flagPath}/configuration`, 'PUT', {
        expectedRevision: lastOwned.revision,
        expectedCatalogRevision: catalog.revision,
        configuration: setSimpleAudience(
          configurationInput(lastOwned.configuration),
          { mode: 'selected', segmentIds: [], directoryTargets: [] },
          catalog.segments,
          () => crypto.randomUUID()
        ),
      })
    );
    lastOwned = flagSchema.parse(
      await management(flagPath, 'PATCH', { expectedRevision: lastOwned.revision, enabled: true })
    );
    await evaluate(false, lastOwned.revision);
    const deniedWrite = await fetch(`${origin}${flagPath}`, {
      method: 'PATCH',
      redirect: 'error',
      signal: AbortSignal.timeout(3000),
      headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: lastOwned.revision, enabled: false }),
    });
    expect(deniedWrite.status, 'Evaluator credential cannot author flags').toBe(403);
    await deniedWrite.body?.cancel();

    await demo.click(ui.section('Segments'));
    await demo.click(ui.createSegment);
    await expect(page.getByRole('heading', { name: 'Create segment', exact: true })).toBeVisible();
    await expect(ui.dialog).toHaveCount(0);
    await expect(ui.project).toBeVisible();
    await expect(ui.fixedEnvironment).toBeVisible();
    await demo.caption(
      'FULL-PAGE SEGMENT DRAFT · Build reusable membership and trait rules without leaving project context. Saving is not publication; review remains a separate confirmation.'
    );
    await demo.fill(ui.segmentName, 'Unsaved draft to discard');
    await demo.click(ui.button('Back to segments'));
    await demo.click(ui.dialogButton('Cancel'));
    await expect(ui.segmentName).toHaveValue('Unsaved draft to discard');
    await demo.click(ui.button('Back to segments'));
    await demo.click(ui.dialogButton('Discard changes'));
    await demo.click(ui.createSegment);
    await expect(ui.segmentName).toHaveValue('');
    await expect(ui.dialog).toHaveCount(0);
    await demo.fill(ui.segmentName, segmentName);
    await demo.fill(ui.segmentKey, segmentKey);
    await ui.description.fill(marker);
    await demo.click(ui.editorButton('+ Add AND condition'));
    await demo.select(ui.trait, 'subjectId');
    await demo.fill(ui.traitValue, excludedSubjectId);
    const createPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${scope}/segments` &&
        response.request().method() === 'POST'
    );
    await demo.click(ui.editorButton('Save segment draft'));
    const created = await createPending;
    expect(created.status()).toBe(200);
    segment = segmentRecordSchema.parse(await created.json());
    expect(segment).toMatchObject({ key: segmentKey, published: null, draft: { version: 1 } });
    expect(segment.usage).toEqual([]);
    await demo.caption(
      'DRAFT ONLY · Saved v1 has no published definition and no live effect. Review names the local scope and exact affected references before publication.'
    );
    await evaluate(false, lastOwned.revision);
    await demo.pause();
    await publishSegment();
    expect(segment.published?.version).toBe(1);
    expect(segment.draft).toBeNull();

    await openFlag();
    await demo.caption(
      'PUBLISHED FIRST · Edit the audience inline. Attaching this published segment creates a following reference—not a version pin. Review and Cancel preserve the unpublished selection without changing live targeting.'
    );
    await demo.click(ui.button('Edit audience'));
    await expect(ui.audienceEditor).toBeVisible();
    await expect(ui.selectedAudience).toBeChecked();
    await demo.fill(ui.audienceSearch, segmentName);
    await demo.click(ui.segmentChoice(segmentName));
    await expect(ui.segmentChoice(segmentName)).toBeChecked();
    const beforeReview = await readFlag();
    expect(beforeReview).toEqual(lastOwned);
    await reviewAudience();
    await demo.pause();
    await demo.click(ui.cancelReview);
    await expect(ui.targetingReview).toHaveCount(0);
    await expect(ui.audienceEditor).toBeVisible();
    await expect(ui.selectedAudience).toBeChecked();
    await expect(ui.segmentChoice(segmentName)).toBeChecked();
    const afterCancel = await readFlag();
    expect(afterCancel.revision).toBe(beforeReview.revision);
    expect(afterCancel.configuration).toEqual(beforeReview.configuration);
    expect(afterCancel).toEqual(beforeReview);
    await evaluate(false, beforeReview.revision);
    await demo.caption(
      'CANCEL IS NOT PUBLICATION · The persisted flag revision and configuration are unchanged, and the segment remains selected in the inline draft. Reopen the same review, then explicitly Publish to Development.'
    );
    await demo.pause(3500);
    await reviewAudience();
    await demo.caption(
      'EXPLICIT PUBLICATION · Review the current and proposed audiences, local scope and warnings. Cancel keeps the draft; only Publish to Development applies this reviewed change.'
    );
    await demo.pause(3500);
    const flagPublishPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${flagPath}/configuration` &&
        response.request().method() === 'PUT'
    );
    await demo.click(ui.publishTargeting);
    const publishedFlag = await flagPublishPending;
    expect(publishedFlag.status()).toBe(200);
    lastOwned = flagSchema.parse(await publishedFlag.json());
    expect(lastOwned.enabled).toBe(beforeReview.enabled);
    expect(lastOwned.lifecycle).toBe(beforeReview.lifecycle);
    await demo.caption(
      'PUBLISHED CONFIGURATION · Explicit Publish created a new local flag revision. Gate and lifecycle stayed unchanged. Test a context evaluates this published configuration, not an unsaved draft.'
    );
    expect(readSimpleAudience(lastOwned.configuration)).toEqual({
      mode: 'selected',
      segmentIds: [segment.id],
      directoryTargets: [],
    });
    const attachedRevision = lastOwned.revision;
    const attachedConfiguration = configurationInput(lastOwned.configuration);
    await evaluate(false, attachedRevision);
    // Show the real operator's synthetic-context result as well as the separate evaluator proof.
    await ui.evaluationContext.fill(
      JSON.stringify({ tenantId: config.tenantId, subjectId, attributes: {} })
    );
    const previewPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${flagPath}/preview` &&
        response.request().method() === 'POST'
    );
    await demo.click(ui.button('Evaluate published'));
    const previewResponse = await previewPending;
    expect(previewResponse.status()).toBe(200);
    expect(previewSchema.parse(await previewResponse.json()).current.value).toEqual({
      type: 'boolean',
      value: false,
    });
    await expect(ui.evaluationDecision).toBeVisible();
    await demo.pause();

    await openSegment();
    segment = await readSegment();
    expect(segment.usage).toEqual([
      {
        flagId: lastOwned.id,
        flagKey,
        flagName: lastOwned.name,
        enabled: true,
        archived: false,
        revision: attachedRevision,
      },
    ]);
    await demo.click(ui.button('Create draft from published'));
    await demo.fill(ui.traitValue, subjectId);
    const draftPending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${scope}/segments/${segment!.id}/draft` &&
        response.request().method() === 'PUT'
    );
    await demo.click(ui.editorButton('Save segment draft'));
    const draftResponse = await draftPending;
    expect(draftResponse.status()).toBe(200);
    segment = segmentRecordSchema.parse(await draftResponse.json());
    expect(segment).toMatchObject({ published: { version: 1 }, draft: { version: 2 } });
    await demo.caption(
      'STILL NOT LIVE · Draft v2 now includes this synthetic person. The attached flag still follows published v1 and the real evaluator still returns false.'
    );
    await evaluate(false, attachedRevision);
    expect((await readFlag()).revision).toBe(attachedRevision);
    await demo.pause();
    await publishSegment();
    expect(segment.published?.version).toBe(2);
    expect(segment.draft).toBeNull();
    const followingFlag = await readFlag();
    expect(followingFlag.revision).toBe(attachedRevision);
    expect(followingFlag.enabled).toBe(true);
    expect(configurationInput(followingFlag.configuration)).toEqual(attachedConfiguration);
    expect(
      followingFlag.configuration.segments.find((item) => item.id === segment!.id)?.revision
    ).toBe(2);
    lastOwned = followingFlag;
    await evaluate(true, attachedRevision);
    await demo.caption(
      'SHARED PUBLICATION · The real evaluator now returns true. The flag was not republished: its revision, gate and direct configuration stayed unchanged while its segment followed v2.'
    );
    await demo.pause(3500);
    await openFlag();
    await expect(ui.followingSegment(segmentName, 2)).toBeVisible();
    await ui.evaluationContext.fill(
      JSON.stringify({ tenantId: config.tenantId, subjectId, attributes: {} })
    );
    const followingPreview = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${flagPath}/preview` &&
        response.request().method() === 'POST'
    );
    await demo.click(ui.button('Evaluate published'));
    const followingResponse = await followingPreview;
    expect(followingResponse.status()).toBe(200);
    expect(previewSchema.parse(await followingResponse.json()).current.value).toEqual({
      type: 'boolean',
      value: true,
    });
    await expect(ui.evaluationDecision).toBeVisible();
    await demo.pause();
    await openSegment();

    await demo.click(ui.detailTab('Version history'));
    await demo.click(ui.button('Inspect snapshot v1'));
    await expect(ui.historySnapshot).toBeVisible();
    await evaluate(true, attachedRevision);
    await demo.caption(
      'READ-ONLY HISTORY · Inspecting retained v1 changes nothing. Restore copies historical contents into a new draft; it never directly rolls back the published audience.'
    );
    await demo.click(ui.button('Restore v1 as draft'));
    await expect(ui.dialog).toContainText('Published v2 remains unchanged');
    const restorePending = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${scope}/segments/${segment!.id}/restore` &&
        response.request().method() === 'POST'
    );
    await demo.click(ui.dialogButton('Restore as draft'));
    const restored = await restorePending;
    expect(restored.status()).toBe(200);
    segment = segmentRecordSchema.parse(await restored.json());
    expect(segment.published?.version).toBe(2);
    expect(segment.draft?.blocks).toEqual(
      segment.history.find((item) => item.version === 1)?.blocks
    );
    expect(segment.draft?.version).toBeGreaterThan(2);
    await expect(ui.draftStatus).toBeVisible();
    await evaluate(true, attachedRevision);
    expect(await readFlag()).toEqual(lastOwned);
    await demo.pause();

    const audit = auditTrailSchema.parse(
      await management(`${scope}/audit?objectType=segment&objectId=${segment.id}&limit=100`)
    );
    const publication = audit.items.find(
      (event) =>
        event.action === 'published' &&
        event.affectedReferences?.some((item) => item.flagId === lastOwned!.id)
    );
    expect(publication, 'A real segment publication records its attached flag').toBeDefined();
    expect(publication!.affectedReferences).toEqual([
      {
        flagId: lastOwned.id,
        flagKey,
        flagName: lastOwned.name,
        enabled: true,
        archived: false,
        revision: attachedRevision,
      },
    ]);
    const restoredEvent = audit.items.find((event) => event.action === 'restored_as_draft');
    expect(
      restoredEvent,
      'Historical restoration is a distinct recorded draft action'
    ).toBeDefined();
    await demo.click(ui.button('View audit history'));
    await demo.caption(
      'AUDIT NAVIGATION · The entire event row opens a compact date/action/object list beside the recorded detail. Switching events stays in that list; Close event returns to the full history table.'
    );
    await demo.click(ui.auditEventRow(publication!.id));
    await expect(ui.compactAuditEvents).toBeVisible();
    await expect(ui.auditEvent(publication!.id)).toHaveAttribute('aria-current', 'true');
    await expect(ui.auditDetail(publication!.id)).toContainText(flagKey);
    await expect(ui.auditDetail(publication!.id)).toContainText('Before & after');
    await demo.caption(
      'AUDIT TRAIL · This immutable publication event records before/after and the exact local reference set. The later historical restore remains draft-only; audit history is not evaluation telemetry.'
    );
    await demo.pause(3500);
    await demo.click(ui.auditEvent(restoredEvent!.id));
    await expect(ui.auditDetail(restoredEvent!.id)).toContainText('Before & after');
    await expect(ui.auditEvent(restoredEvent!.id)).toHaveAttribute('aria-current', 'true');
    await demo.pause();
    await demo.click(ui.button('Close event'));
    await expect(ui.compactAuditEvents).toHaveCount(0);
    await expect(ui.auditEventRow(restoredEvent!.id)).toBeVisible();
    await expect(ui.auditEvent(restoredEvent!.id)).toBeFocused();
    await demo.clearCaption();
  } catch (cause) {
    scenarioFailure = { cause };
  }

  try {
    if (initial && lastOwned) {
      const current = await readFlag();
      if (
        current.owner !== owner ||
        current.description !== marker ||
        JSON.stringify(current) !== JSON.stringify(lastOwned)
      )
        throw new Error(
          'Guarded restoration refused a concurrent or non-owned flag change; retained demo records were not overwritten.'
        );
      const catalog = await readCatalog();
      lastOwned = flagSchema.parse(
        await management(`${flagPath}/configuration`, 'PUT', {
          expectedRevision: current.revision,
          expectedCatalogRevision: catalog.revision,
          configuration: configurationInput(initial.configuration),
        })
      );
      lastOwned = flagSchema.parse(
        await management(flagPath, 'PATCH', {
          expectedRevision: lastOwned.revision,
          enabled: initial.enabled,
        })
      );
      expect(configurationInput(lastOwned.configuration)).toEqual(
        configurationInput(initial.configuration)
      );
      expect(lastOwned.enabled).toBe(initial.enabled);
      flagRestored = true;
    }
  } catch (cleanupFailure) {
    if (scenarioFailure)
      throw new AggregateError(
        [scenarioFailure.cause, cleanupFailure],
        'Unified scenario and guarded restoration failed. Retained records require operator inspection.'
      );
    throw cleanupFailure;
  } finally {
    await testInfo.attach('retained-unified-demo-records', {
      body: JSON.stringify(
        {
          projectId: config.projectId,
          environmentId: config.environmentId,
          flagKey,
          flagId: initial?.id,
          segmentKey,
          segmentId: segment?.id,
          flagRestoration: flagRestored
            ? 'completed'
            : 'not completed; inspect retained flag before rerunning',
          retention:
            'Run-owned disposable records and immutable audit events remain. No segment draft is published by restoration. Inspect current records; failed runs may stop at any step.',
        },
        null,
        2
      ),
      contentType: 'application/json',
    });
  }
  if (scenarioFailure) throw scenarioFailure.cause;
});

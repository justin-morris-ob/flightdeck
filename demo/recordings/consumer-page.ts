import type { DemoRequest } from '../consumer/contracts.ts';
import type { Demo } from './harness.ts';
import type { Locator, Page } from '@playwright/test';

import { expect, test as base } from './harness.ts';

export class ConsumerPage {
  readonly page: Page;
  readonly demo: Demo;
  readonly heading: Locator;
  readonly syntheticIdentityNotice: Locator;
  readonly person: Locator;
  readonly capability: Locator;
  readonly scenario: Locator;
  readonly evaluateButton: Locator;
  readonly surface: Locator;
  readonly value: Locator;
  readonly reason: Locator;
  readonly flag: Locator;
  readonly revision: Locator;
  readonly errorCode: Locator;
  readonly liveDecision: Locator;
  readonly callerFallback: Locator;
  readonly context: Locator;
  readonly metadataDisclosure: Locator;
  readonly metadata: Locator;
  readonly titleFilter: Locator;
  readonly briefs: Locator;
  readonly authorizationError: Locator;

  constructor(page: Page, demo: Demo) {
    this.page = page;
    this.demo = demo;
    this.heading = page.getByRole('heading', { name: 'Consumer contract lab', exact: true });
    this.syntheticIdentityNotice = page.getByText(
      'Local demonstration only. All people, memberships and briefs below are synthetic. This is not BC sign-in or a directory connection.',
      { exact: true }
    );
    this.person = page.getByRole('combobox', { name: 'Demo person', exact: true });
    this.capability = page.getByRole('combobox', { name: 'Capability', exact: true });
    this.scenario = page.getByRole('combobox', { name: 'Service scenario', exact: true });
    this.evaluateButton = page.getByRole('button', { name: 'Evaluate capability', exact: true });
    this.surface = page.locator('.demo-surface');
    this.value = this.surface.locator('.demo-value');
    this.reason = this.surface.locator('dd').nth(0);
    this.flag = this.surface.locator('dd').nth(1);
    this.revision = this.surface.locator('dd').nth(2);
    this.errorCode = this.surface.locator('dd').nth(3);
    this.liveDecision = this.surface.getByText('Live service decision', { exact: true });
    this.callerFallback = this.surface.getByText('Caller fallback · not a service decision', {
      exact: true,
    });
    this.context = page.locator('.demo-controls pre');
    this.metadataDisclosure = this.surface.getByText('Provider metadata', { exact: true });
    this.metadata = this.surface.locator('details pre');
    this.titleFilter = this.surface.getByRole('textbox', {
      name: 'Filter briefs by title',
      exact: true,
    });
    this.briefs = this.surface.getByRole('listitem');
    this.authorizationError = this.surface.getByText(
      'Flightdeck denied this evaluation. Authorization errors are not a false decision or an accepted fallback.',
      { exact: true }
    );
  }

  async open(): Promise<void> {
    await this.page.goto('http://localhost:4722');
    await expect(this.heading).toBeVisible();
    await expect(this.syntheticIdentityNotice).toBeVisible();
    await expect(this.person).toHaveValue('pilot');
    await expect(this.capability).toHaveValue('bc-homepage-title-filter');
    await expect(this.scenario).toHaveValue('live');
    await expect(this.value).toHaveCount(0);
  }

  async choosePerson(value: DemoRequest['personaId']): Promise<void> {
    await this.demo.select(this.person, value);
    await this.expectClearedDecision();
  }

  async chooseCapability(value: DemoRequest['flagKey']): Promise<void> {
    await this.demo.select(this.capability, value);
    await this.expectClearedDecision();
  }

  async chooseScenario(value: DemoRequest['scenario']): Promise<void> {
    await this.demo.select(this.scenario, value);
    await this.expectClearedDecision();
  }

  async expectClearedDecision(): Promise<void> {
    await expect(this.value).toHaveCount(0);
    await expect(this.liveDecision).toHaveCount(0);
    await expect(this.callerFallback).toHaveCount(0);
    await expect(this.authorizationError).toHaveCount(0);
    await expect(this.titleFilter).toHaveCount(0);
  }

  async evaluate(status = 200): Promise<void> {
    const pending = this.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/demo/evaluate' &&
        response.request().method() === 'POST'
    );
    await this.demo.click(this.evaluateButton);
    const response = await pending;
    expect(response.status()).toBe(status);
    if (status === 502) {
      const payload: unknown = await response.json();
      expect(payload).toEqual({
        category: 'authorization',
        error:
          'Flightdeck denied this evaluation. Authorization errors are not a false decision or an accepted fallback.',
      });
      await expect(this.authorizationError).toBeVisible();
      await expect(this.value).toHaveCount(0);
      await expect(this.liveDecision).toHaveCount(0);
      await expect(this.callerFallback).toHaveCount(0);
      await expect(this.titleFilter).toHaveCount(0);
      await expect(this.briefs).toHaveCount(0);
    } else {
      await expect(this.value).toBeVisible();
    }
  }

  async showMetadata(): Promise<void> {
    if (!(await this.metadata.isVisible())) await this.demo.click(this.metadataDisclosure);
    await expect(this.metadata).toBeVisible();
  }

  async expectLiveDecision(
    value: boolean | string | number | Record<string, unknown>,
    key: DemoRequest['flagKey'],
    reason: 'rule' | 'default'
  ): Promise<void> {
    await expect(this.value).toHaveText(JSON.stringify(value));
    await expect(this.flag).toHaveText(key);
    await expect(this.reason).toHaveText(reason === 'rule' ? 'TARGETING_MATCH' : 'DEFAULT');
    await expect(this.errorCode).toHaveText('None');
    await expect(this.revision).toHaveText(/^[1-9]\d*$/);
    await expect(this.liveDecision).toBeVisible();
    await expect(this.callerFallback).toHaveCount(0);
    await expect(this.authorizationError).toHaveCount(0);
    await this.showMetadata();
    const metadata: unknown = JSON.parse(await this.metadata.innerText());
    expect(metadata).toMatchObject({
      flightdeckSource: 'decision',
      flightdeckReason: reason,
      enabled: true,
    });
    expect(metadata).not.toHaveProperty('flightdeckErrorCategory');
  }

  async expectMemberships(
    targetingKey: string,
    organizationIds: string[],
    groupIds: string[]
  ): Promise<void> {
    await expect(this.context).toBeVisible();
    const context: unknown = JSON.parse(await this.context.innerText());
    expect(context).toEqual({
      targetingKey,
      tenantId: 'consumer-demo',
      sourceId: 'consumer-demo',
      organizationIds,
      groupIds,
    });
  }

  async expectFallback(category: 'unavailable' | 'invalid-response'): Promise<void> {
    await expect(this.value).toHaveText('false');
    await expect(this.flag).toHaveText('bc-homepage-title-filter');
    await expect(this.reason).toHaveText('ERROR');
    await expect(this.errorCode).toHaveText(category === 'unavailable' ? 'GENERAL' : 'PARSE_ERROR');
    await expect(this.revision).toHaveText('None · fallback');
    await expect(this.callerFallback).toBeVisible();
    await expect(this.liveDecision).toHaveCount(0);
    await expect(this.titleFilter).toHaveCount(0);
    await this.expectAllBriefs();
    await this.showMetadata();
    const metadata: unknown = JSON.parse(await this.metadata.innerText());
    expect(metadata).toMatchObject({
      flightdeckSource: 'fallback',
      flightdeckReason: category,
      flightdeckErrorCategory: category,
      ...(category === 'unavailable' ? { httpStatus: 503 } : {}),
    });
    expect(metadata).not.toHaveProperty('revision');
  }

  async expectAllBriefs(): Promise<void> {
    await expect(this.briefs).toHaveText([
      'Alpha readiness brief',
      'Coastal response brief',
      'Training overview',
    ]);
  }
}

export const test = base.extend<{ consumer: ConsumerPage }>({
  consumer: async ({ page, demo }, use) => {
    const consumer = new ConsumerPage(page, demo);
    await consumer.open();
    await use(consumer);
  },
});

export { expect } from './harness.ts';

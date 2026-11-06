import type { Locator, Page } from '@playwright/test';

export class UnifiedDesignPage {
  constructor(readonly page: Page) {}

  get administrator(): Locator {
    return this.page.getByRole('button', { name: /Alex Morgan.*administrator/ });
  }
  get project(): Locator {
    return this.page.getByRole('combobox', { name: 'Project', exact: true });
  }
  get environmentSelector(): Locator {
    return this.page.getByRole('combobox', { name: /environment/i });
  }
  get fixedEnvironment(): Locator {
    return this.page.getByText('Environment · Development', { exact: true });
  }
  section(name: 'Flags' | 'Segments' | 'Audit trail'): Locator {
    return this.page
      .locator(
        'nav[aria-label="Flightdeck menu"]:visible, nav[aria-label="Flightdeck sections"]:visible'
      )
      .getByRole('button', { name, exact: true })
      .first();
  }
  button(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
  detailTab(name: 'Definition' | 'Where used' | 'Version history'): Locator {
    return this.page
      .getByRole('tablist', { name: 'Segment detail views', exact: true })
      .getByRole('tab', { name, exact: true });
  }
  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }
  dialogButton(name: string): Locator {
    return this.dialog.getByRole('button', { name, exact: true });
  }
  get createSegment(): Locator {
    return this.page
      .locator('.fd-segments')
      .getByRole('button', { name: 'Create segment', exact: true });
  }
  get segmentEditor(): Locator {
    return this.page.locator('form.fd-segment-editor');
  }
  editorButton(name: string): Locator {
    return this.segmentEditor.getByRole('button', { name, exact: true });
  }
  get segmentName(): Locator {
    return this.segmentEditor.getByRole('textbox', { name: 'Segment name', exact: true });
  }
  get segmentKey(): Locator {
    return this.segmentEditor.getByRole('textbox', { name: 'Immutable key', exact: true });
  }
  get description(): Locator {
    return this.segmentEditor.getByRole('textbox', { name: 'Description · Optional', exact: true });
  }
  get trait(): Locator {
    return this.segmentEditor.getByRole('combobox', { name: 'Trait', exact: true });
  }
  get traitValue(): Locator {
    return this.segmentEditor.getByRole('textbox', { name: 'Value', exact: true });
  }
  get publishedBehavior(): Locator {
    return this.page.getByText('Published behavior · Development', { exact: true });
  }
  followingSegment(name: string, version: number): Locator {
    return this.page.getByText(`Following ${name} · Current v${version}`, { exact: true });
  }
  get audienceEditor(): Locator {
    return this.page.getByRole('region', { name: 'Edit audience', exact: true });
  }
  get selectedAudience(): Locator {
    return this.audienceEditor.getByRole('radio', { name: /Selected audiences/ });
  }
  get audienceSearch(): Locator {
    return this.audienceEditor.getByRole('searchbox', {
      name: 'Search people, organizations, groups, or segments',
      exact: true,
    });
  }
  segmentChoice(name: string): Locator {
    return this.audienceEditor.getByRole('checkbox', { name });
  }
  get reviewChanges(): Locator {
    return this.audienceEditor.getByRole('button', { name: 'Review changes →', exact: true });
  }
  get targetingReview(): Locator {
    return this.page.getByRole('dialog', { name: 'Targeting change review', exact: true });
  }
  get currentAudience(): Locator {
    return this.targetingReview.getByRole('heading', {
      name: 'Current published audience',
      exact: true,
    });
  }
  get proposedAudience(): Locator {
    return this.targetingReview.getByRole('heading', { name: 'Proposed audience', exact: true });
  }
  get cancelReview(): Locator {
    return this.targetingReview.getByRole('button', { name: 'Cancel', exact: true });
  }
  get publishTargeting(): Locator {
    return this.targetingReview.getByRole('button', {
      name: 'Publish to Development',
      exact: true,
    });
  }
  get flagSearch(): Locator {
    return this.page.getByRole('searchbox', { name: 'Search flags', exact: true });
  }
  get inventoryLoading(): Locator {
    return this.page.getByRole('status').filter({ hasText: 'Loading flags…' });
  }
  flag(key: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(key, { exact: true }) })
      .getByRole('button')
      .first();
  }
  get segmentSearch(): Locator {
    return this.page.getByRole('searchbox', { name: 'Search segments', exact: true });
  }
  get historySnapshot(): Locator {
    return this.page.getByRole('heading', {
      name: 'Historical v1 snapshot · Read only · Not active',
      exact: true,
    });
  }
  get draftStatus(): Locator {
    return this.page.getByRole('status').filter({ hasText: /Historical v1 restored as draft/ });
  }
  get compactAuditEvents(): Locator {
    return this.page.getByRole('list', { name: 'Compact audit events', exact: true });
  }
  auditEventRow(id: string): Locator {
    return this.page.getByRole('row').filter({ has: this.auditEvent(id) });
  }
  auditEvent(id: string): Locator {
    return this.page.locator(`button[data-audit-event-id="${id}"]`);
  }
  auditDetail(id: string): Locator {
    return this.page.getByRole('article', { name: `Recorded event ${id}`, exact: true });
  }
  get evaluationContext(): Locator {
    return this.page.getByRole('textbox', { name: 'Evaluation context (JSON)', exact: true });
  }
  get evaluationDecision(): Locator {
    return this.page.getByRole('heading', {
      name: 'Published decision · This context only',
      exact: true,
    });
  }
}

import type { Locator, Page } from '@playwright/test';

export class BCDirectoryPage {
  readonly project: Locator;
  readonly flagSearch: Locator;
  readonly localAdministrator: Locator;
  readonly editAudience: Locator;
  readonly audienceEditor: Locator;
  readonly selectedAudience: Locator;
  readonly emptyAudience: Locator;
  readonly groupSearch: Locator;
  readonly selectedGroups: Locator;
  readonly unavailableDirectory: Locator;
  readonly reviewChanges: Locator;
  readonly targetingReview: Locator;
  readonly currentAudience: Locator;
  readonly proposedAudience: Locator;
  readonly publishTargeting: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly signIn: Locator;
  readonly userMenu: Locator;
  readonly titleFilter: Locator;
  readonly titleFilterSection: Locator;
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
    this.project = page.getByRole('combobox', { name: 'Project', exact: true });
    this.flagSearch = page.getByRole('searchbox', { name: 'Search flags', exact: true });
    this.localAdministrator = page.getByRole('button', { name: /Alex Morgan.*administrator/ });
    this.editAudience = page.getByRole('button', { name: 'Edit audience', exact: true });
    this.audienceEditor = page.getByRole('region', { name: 'Edit audience', exact: true });
    this.selectedAudience = this.audienceEditor.getByRole('radio', { name: /Selected audiences/ });
    this.emptyAudience = this.audienceEditor.getByText(/No audiences selected · Nobody qualifies/);
    this.groupSearch = page.getByRole('searchbox', {
      name: 'Search people, organizations, groups, or segments',
      exact: true,
    });
    this.selectedGroups = this.audienceEditor.getByRole('list', {
      name: 'Selected audiences',
      exact: true,
    });
    this.unavailableDirectory = page.getByText(/Groups lookup unavailable\./);
    this.reviewChanges = this.audienceEditor.getByRole('button', {
      name: 'Review changes →',
      exact: true,
    });
    this.targetingReview = page.getByRole('dialog', {
      name: 'Targeting change review',
      exact: true,
    });
    this.currentAudience = this.targetingReview.getByRole('heading', {
      name: 'Current published audience',
      exact: true,
    });
    this.proposedAudience = this.targetingReview.getByRole('heading', {
      name: 'Proposed audience',
      exact: true,
    });
    this.publishTargeting = this.targetingReview.getByRole('button', {
      name: 'Publish to Development',
      exact: true,
    });
    this.username = page.getByRole('textbox', { name: 'Email or username', exact: true });
    this.password = page.getByLabel('Password', { exact: true });
    this.signIn = page.getByRole('button', { name: 'Sign in', exact: true });
    this.userMenu = page.getByRole('button', { name: 'User menu', exact: true });
    this.titleFilter = page.getByRole('searchbox', {
      name: 'Filter homepage cards by title',
      exact: true,
    });
    this.titleFilterSection = page.getByTestId('homepage-title-filter');
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

  addGroup(name: string): Locator {
    return this.page
      .getByRole('region', { name: 'Groups results', exact: true })
      .getByRole('checkbox', { name });
  }
}

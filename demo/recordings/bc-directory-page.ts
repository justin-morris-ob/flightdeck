import type { Locator, Page } from '@playwright/test';

export class BCDirectoryPage {
  readonly project: Locator;
  readonly environment: Locator;
  readonly flagSearch: Locator;
  readonly localAdministrator: Locator;
  readonly selectedAudience: Locator;
  readonly emptyAudience: Locator;
  readonly groupSearch: Locator;
  readonly searchGroups: Locator;
  readonly selectedGroups: Locator;
  readonly unavailableDirectory: Locator;
  readonly reviewTargeting: Locator;
  readonly proposedAudience: Locator;
  readonly reviewPublication: Locator;
  readonly confirmPublication: Locator;
  readonly username: Locator;
  readonly password: Locator;
  readonly signIn: Locator;
  readonly userMenu: Locator;
  readonly titleFilter: Locator;
  readonly titleFilterSection: Locator;
  readonly page: Page;
  readonly groups: Locator;

  constructor(page: Page) {
    this.page = page;
    this.project = page.getByRole('combobox', { name: 'Project', exact: true });
    this.environment = page.getByRole('combobox', {
      name: 'Configuration environment',
      exact: true,
    });
    this.flagSearch = page.getByRole('searchbox', { name: 'Search flags', exact: true });
    this.localAdministrator = page.getByRole('button', { name: /Alex Morgan.*administrator/ });
    this.selectedAudience = page.getByRole('radio', { name: /Selected audiences/ });
    this.emptyAudience = page.getByText(/No audiences selected · nobody qualifies/);
    this.groups = page.getByRole('group', { name: 'Groups', exact: true });
    this.groupSearch = this.groups.getByRole('searchbox', { name: 'Search groups', exact: true });
    this.searchGroups = this.groups.getByRole('button', { name: 'Search groups', exact: true });
    this.selectedGroups = this.groups.getByRole('list', { name: 'Selected groups', exact: true });
    this.unavailableDirectory = this.groups.getByText(
      /BC directory unavailable\. Saved selections were not changed\./
    );
    this.reviewTargeting = page.getByRole('button', {
      name: 'Review targeting changes',
      exact: true,
    });
    this.proposedAudience = page.getByRole('heading', { name: 'Proposed audience', exact: true });
    this.reviewPublication = page.getByRole('button', { name: /^Review and publish to / });
    this.confirmPublication = page
      .getByRole('dialog')
      .getByRole('button', { name: /^Publish to / });
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

  flag(key: string): Locator {
    return this.page
      .getByRole('row')
      .filter({ has: this.page.getByText(key, { exact: true }) })
      .getByRole('button', { name: /^Open / })
      .first();
  }

  addGroup(name: string): Locator {
    return this.groups.getByRole('button', { name: `Add ${name}`, exact: true });
  }
}

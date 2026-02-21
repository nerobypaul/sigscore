import { test, expect } from '@playwright/test';
import { createTestUser, authHeaders, TestUser } from './helpers/api';
import { injectAuth } from './helpers/auth';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api/v1';

let user: TestUser;

test.beforeAll(async ({ request }) => {
  user = await createTestUser(request);
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, user);
});

/**
 * Opens the global search modal by clicking the search trigger button in the sidebar.
 */
async function openSearch(page: import('@playwright/test').Page) {
  // The GlobalSearch component renders a button with "Search..." text when closed
  const searchButton = page.getByRole('button', { name: /search/i });
  await searchButton.click();

  // Wait for the search input inside the modal to be visible
  const searchInput = page.getByPlaceholder('Search contacts, companies, deals...');
  await expect(searchInput).toBeVisible();
  return searchInput;
}

test.describe('Global search', () => {
  test('search input renders and can be opened', async ({ page }) => {
    // The sidebar should contain a search trigger button
    const searchButton = page.getByRole('button', { name: /search/i });
    await expect(searchButton).toBeVisible();

    // Click to open the search modal
    await searchButton.click();

    // The modal search input should now be visible
    const searchInput = page.getByPlaceholder('Search contacts, companies, deals...');
    await expect(searchInput).toBeVisible();
  });

  test('search for a contact returns results', async ({ page, request }) => {
    // Seed a contact with a unique name via the API
    const uniqueName = `Findme${Date.now()}`;
    const createRes = await request.post(`${API_BASE}/contacts`, {
      headers: authHeaders(user),
      data: {
        firstName: uniqueName,
        lastName: 'Searchable',
        email: `${uniqueName.toLowerCase()}@test.sigscore.dev`,
      },
    });
    expect(createRes.ok()).toBeTruthy();

    // Open global search and type the unique name
    const searchInput = await openSearch(page);
    await searchInput.fill(uniqueName);

    // Wait for search results to appear (debounced 200ms + network)
    // Results contain a button with the contact's name
    const resultItem = page.locator('button').filter({ hasText: uniqueName });
    await expect(resultItem.first()).toBeVisible({ timeout: 10_000 });
  });

  test('search with no results shows empty state', async ({ page }) => {
    const nonsenseQuery = `zznoexist${Date.now()}`;

    const searchInput = await openSearch(page);
    await searchInput.fill(nonsenseQuery);

    // The empty state message should appear: 'No results found for "..."'
    const emptyState = page.getByText(`No results found for "${nonsenseQuery}"`);
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
  });
});

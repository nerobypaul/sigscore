import { test, expect, APIRequestContext } from '@playwright/test';
import { createTestUser, authHeaders, TestUser } from './helpers/api';
import { injectAuth } from './helpers/auth';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api/v1';

interface SeededData {
  companyId: string;
  dealId: string;
  dealTitle: string;
}

let user: TestUser;
let seeded: SeededData;

/**
 * Seed a company and a deal via the API so the pipeline is not empty.
 */
async function seedDealsData(request: APIRequestContext, u: TestUser): Promise<SeededData> {
  const headers = authHeaders(u);

  // Create a company for the deal
  const companyRes = await request.post(`${API_BASE}/companies`, {
    headers,
    data: { name: 'E2E Deals Corp', domain: 'e2e-deals.test' },
  });
  if (!companyRes.ok()) {
    throw new Error(`Company creation failed: ${companyRes.status()} ${await companyRes.text()}`);
  }
  const company = await companyRes.json();

  // Create a deal linked to the company
  const dealTitle = `Enterprise License ${Date.now()}`;
  const dealRes = await request.post(`${API_BASE}/deals`, {
    headers,
    data: {
      title: dealTitle,
      amount: 15000,
      currency: 'USD',
      stage: 'IDENTIFIED',
      companyId: company.id,
    },
  });
  if (!dealRes.ok()) {
    throw new Error(`Deal creation failed: ${dealRes.status()} ${await dealRes.text()}`);
  }
  const deal = await dealRes.json();

  return {
    companyId: company.id,
    dealId: deal.id,
    dealTitle,
  };
}

test.describe('Deals module', () => {
  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request);
    seeded = await seedDealsData(request, user);
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, user);
  });

  // ----------------------------------------------------------------
  // 1. View deals page
  // ----------------------------------------------------------------
  test('should display the deals page with pipeline and list views', async ({ page }) => {
    await page.goto('/deals');

    // The page heading should be visible
    await expect(page.getByRole('heading', { name: 'Deals' })).toBeVisible();

    // The seeded deal should appear somewhere on the page
    await expect(page.getByText(seeded.dealTitle)).toBeVisible({ timeout: 10_000 });

    // Pipeline view should be the default — check for the "Pipeline" toggle being active
    const pipelineBtn = page.getByRole('button', { name: 'Pipeline' });
    await expect(pipelineBtn).toBeVisible();

    // Stage columns should be present (at least Identified, since we seeded a deal there)
    await expect(page.getByText('Identified')).toBeVisible();

    // Switch to List view
    const listBtn = page.getByRole('button', { name: 'List' });
    await listBtn.click();

    // In list view the deal should appear in a table row
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('link', { name: seeded.dealTitle })).toBeVisible();
  });

  // ----------------------------------------------------------------
  // 2. Create a deal via the UI modal
  // ----------------------------------------------------------------
  test('should create a new deal through the Add Deal modal', async ({ page }) => {
    await page.goto('/deals');
    await expect(page.getByRole('heading', { name: 'Deals' })).toBeVisible();

    // Open the create modal
    await page.getByRole('button', { name: 'Add Deal' }).click();

    // The modal heading should be visible
    await expect(page.getByRole('heading', { name: 'New Deal' })).toBeVisible();

    // Fill in the form
    const newTitle = `UI Created Deal ${Date.now()}`;
    await page.getByLabel('Deal title').fill(newTitle);
    await page.getByLabel('Amount ($)').fill('25000');

    // Select the Activated stage
    await page.getByLabel('Stage').selectOption('ACTIVATED');

    // Submit the form
    await page.getByRole('button', { name: 'Create Deal' }).click();

    // The modal should close and the new deal should appear on the page
    await expect(page.getByRole('heading', { name: 'New Deal' })).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(newTitle)).toBeVisible({ timeout: 10_000 });
  });

  // ----------------------------------------------------------------
  // 3. View deal detail page
  // ----------------------------------------------------------------
  test('should navigate to the deal detail page and see deal information', async ({ page }) => {
    await page.goto('/deals');
    await expect(page.getByText(seeded.dealTitle)).toBeVisible({ timeout: 10_000 });

    // Click the deal title link to navigate to the detail page
    await page.getByRole('link', { name: seeded.dealTitle }).first().click();

    // Should navigate to /deals/:id
    await expect(page).toHaveURL(new RegExp(`/deals/${seeded.dealId}`), { timeout: 10_000 });

    // The deal title should be visible in the header area
    await expect(page.getByText(seeded.dealTitle)).toBeVisible();

    // The stage badge should show "Identified"
    await expect(page.getByText('Identified')).toBeVisible();

    // The details section should be present
    await expect(page.getByText('Details')).toBeVisible();

    // The company sidebar card should show the linked company
    await expect(page.getByText('E2E Deals Corp')).toBeVisible();

    // Metadata section should show Created and Updated dates
    await expect(page.getByText('Metadata')).toBeVisible();
    await expect(page.getByText('Created')).toBeVisible();
  });

  // ----------------------------------------------------------------
  // 4. Update deal stage on the detail page
  // ----------------------------------------------------------------
  test('should update the deal stage via the stage dropdown on the detail page', async ({ page }) => {
    await page.goto(`/deals/${seeded.dealId}`);

    // Wait for the deal to load
    await expect(page.getByText(seeded.dealTitle)).toBeVisible({ timeout: 10_000 });

    // The current stage should be "Identified"
    const stageBadge = page.locator('button').filter({ hasText: 'Identified' });
    await expect(stageBadge).toBeVisible();

    // Click the stage badge to open the dropdown
    await stageBadge.click();

    // The dropdown with all stage options should appear
    await expect(page.getByText('Sales Qualified')).toBeVisible();

    // Select "Sales Qualified"
    await page.getByRole('button', { name: 'Sales Qualified' }).click();

    // The stage badge should now show "Sales Qualified" (optimistic update)
    await expect(page.locator('button').filter({ hasText: 'Sales Qualified' })).toBeVisible({ timeout: 5_000 });

    // Verify the toast notification confirms the change
    await expect(page.getByText(/stage changed/i)).toBeVisible({ timeout: 5_000 });

    // Reload the page to confirm persistence
    await page.reload();
    await expect(page.getByText(seeded.dealTitle)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button').filter({ hasText: 'Sales Qualified' })).toBeVisible();
  });
});

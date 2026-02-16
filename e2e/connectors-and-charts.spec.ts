import { test, expect, APIRequestContext } from '@playwright/test';
import { createTestUser, authHeaders, TestUser } from './helpers/api';
import { injectAuth } from './helpers/auth';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api/v1';

let user: TestUser;
let companyId: string;

/**
 * Seed a company via the API so we have data for chart-related tests.
 */
async function seedCompany(request: APIRequestContext, u: TestUser): Promise<string> {
  const headers = authHeaders(u);

  const res = await request.post(`${API_BASE}/companies`, {
    headers,
    data: {
      name: 'E2E Charts Corp',
      domain: 'e2e-charts.test',
      industry: 'Developer Tools',
    },
  });
  if (!res.ok()) {
    throw new Error(`Company creation failed: ${res.status()} ${await res.text()}`);
  }
  const company = await res.json();
  return company.id;
}

test.describe('Connector settings and score charts', () => {
  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request);
    companyId = await seedCompany(request, user);
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, user);
  });

  // ----------------------------------------------------------------
  // 1. Intercom connector tab
  // ----------------------------------------------------------------
  test.describe('Intercom connector settings', () => {
    test('should display the Intercom connect form with all fields', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Click the Intercom tab button
      await page.getByRole('button', { name: 'Intercom' }).click();

      // Verify the heading
      await expect(page.getByRole('heading', { name: 'Connect Intercom' })).toBeVisible({ timeout: 10_000 });

      // Verify the access token input
      const accessTokenInput = page.getByPlaceholder('Optional — for API polling');
      await expect(accessTokenInput).toBeVisible();

      // Verify the webhook secret input
      const webhookSecretInput = page.getByPlaceholder('Optional HMAC secret for webhook verification').first();
      await expect(webhookSecretInput).toBeVisible();

      // Verify the "Tracked Events" label
      await expect(page.getByText('Tracked Events').first()).toBeVisible();

      // Verify event checkboxes are present and checked by default
      const eventLabels = [
        'Conversation Opened',
        'Conversation Replied',
        'Conversation Closed',
        'Conversation Rated',
      ];
      for (const label of eventLabels) {
        const checkbox = page.getByLabel(label).first();
        await expect(checkbox).toBeVisible();
        await expect(checkbox).toBeChecked();
      }

      // Verify the connect button is present
      await expect(page.getByRole('button', { name: 'Connect Intercom' })).toBeVisible();
    });

    test('should show the "How it works" section with instructions', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Intercom' }).click();

      await expect(page.getByText('How it works').first()).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText('Connect with an optional access token for API-based polling')
      ).toBeVisible();
    });
  });

  // ----------------------------------------------------------------
  // 2. Zendesk connector tab
  // ----------------------------------------------------------------
  test.describe('Zendesk connector settings', () => {
    test('should display the Zendesk connect form with all fields', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Click the Zendesk tab button
      await page.getByRole('button', { name: 'Zendesk' }).click();

      // Verify the heading
      await expect(page.getByRole('heading', { name: 'Connect Zendesk' })).toBeVisible({ timeout: 10_000 });

      // Verify the subdomain input
      const subdomainInput = page.getByPlaceholder('yourcompany');
      await expect(subdomainInput).toBeVisible();

      // Verify the ".zendesk.com" suffix is shown
      await expect(page.getByText('.zendesk.com')).toBeVisible();

      // Verify the admin email input
      const emailInput = page.getByPlaceholder('admin@yourcompany.com');
      await expect(emailInput).toBeVisible();

      // Verify the API token input
      const apiTokenInput = page.getByPlaceholder('Your Zendesk API token');
      await expect(apiTokenInput).toBeVisible();

      // Verify the webhook secret input
      const webhookSecretInput = page.getByPlaceholder('Optional HMAC secret for webhook verification').first();
      await expect(webhookSecretInput).toBeVisible();

      // Verify the "Tracked Events" label
      await expect(page.getByText('Tracked Events').first()).toBeVisible();

      // Verify event checkboxes are present and checked by default
      const eventLabels = [
        'Ticket Created',
        'Ticket Updated',
        'Ticket Solved',
        'Satisfaction Rated',
      ];
      for (const label of eventLabels) {
        const checkbox = page.getByLabel(label).first();
        await expect(checkbox).toBeVisible();
        await expect(checkbox).toBeChecked();
      }

      // Verify the connect button is present and initially disabled (fields are empty)
      const connectBtn = page.getByRole('button', { name: 'Connect Zendesk' });
      await expect(connectBtn).toBeVisible();
      await expect(connectBtn).toBeDisabled();
    });

    test('should enable Connect Zendesk button when required fields are filled', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Zendesk' }).click();
      await expect(page.getByRole('heading', { name: 'Connect Zendesk' })).toBeVisible({ timeout: 10_000 });

      const connectBtn = page.getByRole('button', { name: 'Connect Zendesk' });

      // Button is disabled when fields are empty
      await expect(connectBtn).toBeDisabled();

      // Fill in required fields
      await page.getByPlaceholder('yourcompany').fill('testcompany');
      await page.getByPlaceholder('admin@yourcompany.com').fill('admin@test.com');
      await page.getByPlaceholder('Your Zendesk API token').fill('fake-token');

      // Button should now be enabled
      await expect(connectBtn).toBeEnabled();
    });

    test('should show the "How it works" section with instructions', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.getByRole('button', { name: 'Zendesk' }).click();

      await expect(page.getByText('How it works').first()).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByText('Enter your Zendesk subdomain, admin email, and API token')
      ).toBeVisible();
    });
  });

  // ----------------------------------------------------------------
  // 3. Score Trend Chart on Company Detail page
  // ----------------------------------------------------------------
  test.describe('Score Trend Chart', () => {
    test('should render the PQA Score Trend section on company detail', async ({ page }) => {
      await page.goto(`/companies/${companyId}`);
      await page.waitForLoadState('networkidle');

      // Verify the company loaded
      await expect(page.getByText('E2E Charts Corp')).toBeVisible({ timeout: 10_000 });

      // The ScoreTrendChart component always renders a heading "PQA Score Trend"
      // regardless of whether data exists (shows empty state or chart)
      await expect(page.getByText('PQA Score Trend')).toBeVisible();
    });

    test('should show "No score history yet" for a new company without snapshots', async ({ page }) => {
      await page.goto(`/companies/${companyId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('E2E Charts Corp')).toBeVisible({ timeout: 10_000 });

      // A freshly-seeded company has no score history, so the empty state text should show
      await expect(page.getByText('No score history yet')).toBeVisible({ timeout: 10_000 });
    });
  });

  // ----------------------------------------------------------------
  // 4. Score Trend Sparklines on Companies list
  // ----------------------------------------------------------------
  test.describe('Score Trend Sparklines', () => {
    test('should render sparkline SVGs in company cards on the companies list', async ({ page }) => {
      await page.goto('/companies');
      await page.waitForLoadState('networkidle');

      // Verify our seeded company appears
      await expect(page.getByText('E2E Charts Corp')).toBeVisible({ timeout: 10_000 });

      // ScoreTrendSparkline renders an SVG with aria-label="Score trend: ..." when it
      // has data, or an aria-hidden SVG placeholder when loading/no data. Either way,
      // there should be at least one SVG element within the company cards area.
      // Look for sparkline SVGs -- the component renders them with class "flex-shrink-0"
      const sparklineSvgs = page.locator('svg.flex-shrink-0');
      await expect(sparklineSvgs.first()).toBeVisible({ timeout: 10_000 });

      // Verify the SVG has dimensions matching the sparkline props (width=64, height=20)
      const firstSvg = sparklineSvgs.first();
      await expect(firstSvg).toHaveAttribute('width', '64');
      await expect(firstSvg).toHaveAttribute('height', '20');
    });
  });
});

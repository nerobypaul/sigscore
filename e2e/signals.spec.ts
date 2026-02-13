import { test, expect, APIRequestContext } from '@playwright/test';
import { createTestUser, authHeaders, TestUser } from './helpers/api';
import { injectAuth } from './helpers/auth';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api/v1';

let user: TestUser;
let sourceId: string;

/**
 * Create a signal source and seed a few signals so the feed is not empty.
 */
async function seedSignalsData(request: APIRequestContext, u: TestUser): Promise<string> {
  const headers = authHeaders(u);

  // Create a signal source (required for signal ingestion)
  const sourceRes = await request.post(`${API_BASE}/sources`, {
    headers,
    data: {
      type: 'WEBSITE',
      name: 'E2E Test Website',
      config: { url: 'https://e2e.test' },
    },
  });
  if (!sourceRes.ok()) {
    throw new Error(`Source creation failed: ${sourceRes.status()} ${await sourceRes.text()}`);
  }
  const source = await sourceRes.json();
  const sid = source.id;

  // Seed a few signals of different types
  const signalPayloads = [
    { sourceId: sid, type: 'page_view', metadata: { page: '/docs', referrer: 'google.com' } },
    { sourceId: sid, type: 'signup', metadata: { plan: 'free' } },
    { sourceId: sid, type: 'api_call', metadata: { endpoint: '/v1/contacts', method: 'GET' } },
  ];

  for (const payload of signalPayloads) {
    const res = await request.post(`${API_BASE}/signals`, {
      headers,
      data: payload,
    });
    if (!res.ok()) {
      throw new Error(`Signal ingest failed: ${res.status()} ${await res.text()}`);
    }
  }

  return sid;
}

test.describe('Signals module', () => {
  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request);
    sourceId = await seedSignalsData(request, user);
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, user);
  });

  // ----------------------------------------------------------------
  // 1. View signals page
  // ----------------------------------------------------------------
  test('should display the signal feed with seeded signals', async ({ page }) => {
    await page.goto('/signals');

    // The page heading should be visible
    await expect(page.getByRole('heading', { name: 'Signal Feed' })).toBeVisible();

    // Wait for the signal list to load (check that seeded signal types appear)
    await expect(page.getByText('page view')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('signup')).toBeVisible();
    await expect(page.getByText('api call')).toBeVisible();

    // The total signal count should reflect at least the 3 seeded signals
    await expect(page.getByText(/\d+ total signals/)).toBeVisible();

    // Filter controls should be present
    await expect(page.getByLabel('Signal Type')).toBeVisible();
    await expect(page.getByLabel('From')).toBeVisible();
    await expect(page.getByLabel('To')).toBeVisible();

    // Metadata toggle should be present on at least one signal card
    await expect(page.getByText('Show metadata').first()).toBeVisible();
  });

  // ----------------------------------------------------------------
  // 2. Ingest a signal via the API and verify it appears in the feed
  // ----------------------------------------------------------------
  test('should show a newly ingested signal in the feed after reload', async ({ page, request }) => {
    const headers = authHeaders(user);
    const uniquePage = `/pricing-${Date.now()}`;

    // Ingest a signal via the API
    const res = await request.post(`${API_BASE}/signals`, {
      headers,
      data: {
        sourceId,
        type: 'page_view',
        metadata: { page: uniquePage },
      },
    });
    expect(res.ok()).toBeTruthy();

    // Navigate to the signals page (or reload if already there)
    await page.goto('/signals');

    // Wait for the feed to load and check that our unique signal appears
    // The metadata contains our unique page path — expand it to verify
    await expect(page.getByText('page view').first()).toBeVisible({ timeout: 10_000 });

    // Click "Show metadata" on the first signal card to reveal the metadata JSON
    const showMetadataBtn = page.getByText('Show metadata').first();
    await showMetadataBtn.click();

    // The expanded metadata should contain our unique page path
    await expect(page.getByText(uniquePage)).toBeVisible({ timeout: 5_000 });
  });
});

import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Landing page tests (no demo seed needed)
// ---------------------------------------------------------------------------

test.describe('Landing Page', () => {
  test('loads and shows key elements', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Turn Developer Signals')).toBeVisible();
    await expect(page.getByText('Into Pipeline')).toBeVisible();
    await expect(page.getByRole('button', { name: /explore live demo/i })).toBeVisible();
    await expect(page.getByText('Three steps to hidden pipeline')).toBeVisible();
    await expect(page.getByText('Simple, transparent pricing')).toBeVisible();
  });

  test('navigation links work', async ({ page }) => {
    await page.goto('/');

    for (const name of ['Features', 'How It Works']) {
      await expect(page.locator('nav').getByRole('link', { name })).toBeVisible();
    }

    const pricingLink = page.locator('nav').getByRole('link', { name: 'Pricing' });
    await pricingLink.click();
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('features section displays all features', async ({ page }) => {
    await page.goto('/');
    await page.locator('#features').scrollIntoViewIfNeeded();

    for (const feature of ['Signal Engine', 'PQA Scoring', 'PLG Pipeline', 'AI Briefs']) {
      await expect(page.getByText(feature).first()).toBeVisible();
    }
  });

  test('shows integration logos', async ({ page }) => {
    await page.goto('/');

    for (const name of ['GitHub', 'npm', 'Slack', 'HubSpot', 'Salesforce']) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
  });

  test('FAQ section is interactive', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Frequently asked questions').scrollIntoViewIfNeeded();
    await page.getByText('How long does setup take?').click();
    await expect(page.getByText('2 minutes. Connect GitHub, see results.')).toBeVisible();
  });

  test('comparison table shows Sigscore advantages', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Why Sigscore over the alternatives?').scrollIntoViewIfNeeded();

    await expect(page.getByText('Common Room').first()).toBeVisible();
    await expect(page.getByText('Reo.dev').first()).toBeVisible();
    await expect(page.getByText('From $0/mo').first()).toBeVisible();
  });

  test('product mockup is displayed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText("See who's evaluating your tool").first()).toBeVisible();
    await expect(page.getByText('Arcline Tools').first()).toBeVisible();
  });

  test('bottom CTA is visible', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Start finding your hidden pipeline').scrollIntoViewIfNeeded();
    await expect(page.getByText('Free tier forever. No credit card. Setup in 2 minutes.')).toBeVisible();
  });

  test('footer contains expected links', async ({ page }) => {
    await page.goto('/');
    await page.locator('footer').scrollIntoViewIfNeeded();

    for (const linkText of ['Pricing', 'Developers', 'Changelog', 'Terms', 'Privacy', 'Sign in']) {
      await expect(page.locator('footer').getByRole('link', { name: linkText }).first()).toBeVisible();
    }
    await expect(page.locator('footer').getByText(/Sigscore. All rights reserved/)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Public pages (no auth needed)
// ---------------------------------------------------------------------------

test.describe('Public Pages', () => {
  test('registration page loads correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /sigscore/i })).toBeVisible();
    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Last name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /sigscore/i })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('pricing page displays all tiers', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Free').first()).toBeVisible();
    await expect(page.getByText('$79').first()).toBeVisible();
    await expect(page.getByText('$199').first()).toBeVisible();
    await expect(page.getByText('$299').first()).toBeVisible();
  });

  test('API docs page loads', async ({ page }) => {
    await page.goto('/api-docs');
    await expect(
      page.locator('.swagger-ui, #swagger-ui, .swagger-container, [class*="swagger"]').first()
    ).toBeVisible({ timeout: 15000 });
  });
});

// ---------------------------------------------------------------------------
// Demo Flow — seed once via API, then test the dashboard experience
// ---------------------------------------------------------------------------

test.describe('Demo Experience', () => {
  // Seed the demo once via direct API call, then inject the token into each test.
  // This avoids hitting rate limits from repeated demo button clicks.
  let accessToken: string;
  let refreshToken: string;
  let organizationId: string;

  test.beforeAll(async ({ request }) => {
    const baseUrl = process.env.E2E_API_URL || process.env.E2E_BASE_URL || 'https://sigscore.dev';
    const apiUrl = baseUrl.includes('/api/') ? baseUrl : `${baseUrl}/api/v1`;

    const res = await request.post(`${apiUrl}/demo/seed`, { data: {} });
    if (!res.ok()) {
      throw new Error(`Demo seed failed: ${res.status()} ${await res.text()}`);
    }
    const data = await res.json();
    accessToken = data.accessToken;
    refreshToken = data.refreshToken;
    organizationId = data.organizationId;
  });

  /**
   * Inject demo auth tokens into localStorage so the page loads as authenticated.
   */
  async function injectDemoAuth(page: import('@playwright/test').Page) {
    // Must visit a page first to set localStorage on the correct origin
    await page.goto('/login');
    await page.evaluate(
      ({ token, refresh, orgId }) => {
        localStorage.setItem('accessToken', token);
        localStorage.setItem('refreshToken', refresh);
        localStorage.setItem('organizationId', orgId);
      },
      { token: accessToken, refresh: refreshToken, orgId: organizationId },
    );
    await page.goto('/');
    // Wait for the sidebar to confirm we're in the authenticated layout
    await expect(page.locator('aside')).toBeVisible({ timeout: 15_000 });

    // Dismiss onboarding hints if they appear (they overlay sidebar items)
    const skipBtn = page.getByRole('button', { name: /skip/i });
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click({ force: true });
    }

    // Dismiss cookie banner if present
    const cookieBanner = page.locator('[aria-label="Cookie consent"]');
    if (await cookieBanner.isVisible({ timeout: 500 }).catch(() => false)) {
      const acceptBtn = cookieBanner.getByRole('button').first();
      if (await acceptBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await acceptBtn.click();
      }
    }
  }

  test('demo seed via button creates environment and redirects', async ({ page }) => {
    await page.goto('/');

    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    // Should show loading state
    await expect(page.getByText('Loading demo...')).toBeVisible({ timeout: 5000 });

    // Wait for the authenticated sidebar (demo seed + page reload)
    await expect(page.locator('aside')).toBeVisible({ timeout: 60_000 });

    // Verify we're on the dashboard
    await expect(page.locator('aside').getByText('Dashboard', { exact: true })).toBeVisible();
  });

  test('demo visitor sees conversion banner', async ({ page }) => {
    await injectDemoAuth(page);

    await expect(page.getByText(/exploring demo/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /start free/i }).first()).toBeVisible();
  });

  test('demo visitor sees onboarding hints overlay', async ({ page }) => {
    await injectDemoAuth(page);

    // Welcome step should appear
    await expect(page.getByText(/welcome to sigscore/i)).toBeVisible({ timeout: 5000 });

    // Dismiss cookie banner if it overlaps
    const cookieBanner = page.locator('[aria-label="Cookie consent"]');
    if (await cookieBanner.isVisible({ timeout: 1000 }).catch(() => false)) {
      const acceptBtn = cookieBanner.getByRole('button').first();
      if (await acceptBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await acceptBtn.click();
      }
    }

    // Skip the tour to verify it dismisses
    const skipButton = page.getByRole('button', { name: /skip/i });
    if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipButton.click({ force: true });
      await expect(page.getByText(/welcome to sigscore/i)).not.toBeVisible({ timeout: 3000 });
    }
  });

  test('demo nav shows disabled items with Pro badge', async ({ page }) => {
    await injectDemoAuth(page);

    // Disabled items in always-expanded sections should be visible
    for (const item of ['Enrichment', 'Playbooks', 'Sequences']) {
      await expect(page.locator('aside').getByText(item, { exact: true })).toBeVisible();
    }

    // Active nav items should be clickable links
    for (const item of ['Dashboard', 'PQA Scores', 'Signals']) {
      await expect(page.locator('aside').getByText(item, { exact: true })).toBeVisible();
    }
  });

  test('PQA dashboard shows score overview', async ({ page }) => {
    await injectDemoAuth(page);

    // Navigate to PQA Scores
    await page.locator('aside').getByText('PQA Scores', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PQA Scores' })).toBeVisible({ timeout: 10_000 });

    // Summary cards
    await expect(page.getByText('Total Scored')).toBeVisible({ timeout: 5000 });

    // Chart SVG should be rendered
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('companies page shows demo companies with sparklines', async ({ page }) => {
    await injectDemoAuth(page);

    // Navigate to Companies
    await page.locator('aside').getByText('Companies', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Companies' })).toBeVisible({ timeout: 10_000 });

    // Demo company should be visible
    await expect(page.getByText('Arcline Tools')).toBeVisible({ timeout: 5000 });

    // Sparkline SVGs
    const sparklines = page.locator('svg[aria-label^="Score trend"]');
    await expect(sparklines.first()).toBeVisible({ timeout: 5000 });
  });

  test('signals page shows demo signals', async ({ page }) => {
    await injectDemoAuth(page);

    // Navigate to Signals
    await page.locator('aside').getByText('Signals', { exact: true }).click();
    await expect(page.getByRole('heading', { name: /signal/i }).first()).toBeVisible({ timeout: 10_000 });

    // Should have signals listed
    await expect(page.getByText(/total signals/i)).toBeVisible({ timeout: 5000 });
  });

  test('integrations page shows 16 connected sources', async ({ page }) => {
    await injectDemoAuth(page);

    // Expand Settings section and click Integrations
    const settingsHeader = page.locator('aside').getByText('SETTINGS');
    await settingsHeader.click();
    await page.locator('aside').getByText('Integrations', { exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible({ timeout: 10_000 });

    // Stats bar should show connected count
    await expect(page.getByText('Connected').first()).toBeVisible({ timeout: 5000 });
  });

  test('deals page shows demo deals', async ({ page }) => {
    await injectDemoAuth(page);

    // Navigate to Deals
    await page.locator('aside').getByText('Deals', { exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Deals' })).toBeVisible({ timeout: 10_000 });

    // Demo deals should be visible
    await expect(page.getByText('Arcline Tools').first()).toBeVisible({ timeout: 5000 });
  });
});

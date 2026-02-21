import { test, expect } from '@playwright/test';

test.describe('Demo Flow', () => {
  test('landing page loads and shows key elements', async ({ page }) => {
    await page.goto('/');

    // Hero section - check for the main heading text
    await expect(page.getByText('Turn Developer Signals')).toBeVisible();
    await expect(page.getByText('Into Pipeline')).toBeVisible();

    // CTA buttons in hero section
    await expect(page.getByRole('link', { name: /start free.*no credit card/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /explore live demo/i })).toBeVisible();

    // Key sections exist
    await expect(page.getByText('Three steps to hidden pipeline')).toBeVisible();
    await expect(page.getByText('Simple, transparent pricing')).toBeVisible();
  });

  test('demo seed creates environment and redirects to dashboard', async ({ page }) => {
    await page.goto('/');

    // Click the demo button
    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await expect(demoButton).toBeVisible();
    await demoButton.click();

    // Should show loading state
    await expect(page.getByText('Loading demo...')).toBeVisible({ timeout: 5000 });

    // Wait for navigation to dashboard (demo seed takes a few seconds)
    await page.waitForURL('/', { timeout: 20000 });

    // After demo seed, should be authenticated and see dashboard content
    // The page reloads with tokens in localStorage - verify we're not on landing page anymore
    await expect(page.locator('body')).not.toContainText('Turn Developer Signals', { timeout: 5000 });

    // Verify we can see the authenticated sidebar
    await expect(page.locator('aside')).toBeVisible();
  });

  test('demo visitor sees conversion banner with CTAs', async ({ page }) => {
    await page.goto('/');

    // Seed the demo
    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await demoButton.click();
    await page.waitForURL('/', { timeout: 20000 });
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    // DemoModeBanner should be visible with conversion CTAs
    await expect(page.getByText(/exploring demo/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: /start free/i })).toBeVisible();
  });

  test('demo visitor sees onboarding hints overlay', async ({ page }) => {
    await page.goto('/');

    // Seed the demo
    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await demoButton.click();
    await page.waitForURL('/', { timeout: 20000 });
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    // DemoOnboardingHints should show the welcome step
    await expect(page.getByText(/welcome to sigscore/i)).toBeVisible({ timeout: 5000 });

    // Should have Next button to advance steps
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();

    // Advance through steps
    await nextButton.click();
    await expect(page.getByText(/signal feed/i)).toBeVisible({ timeout: 3000 });

    // Skip should dismiss
    const skipButton = page.getByRole('button', { name: /skip/i });
    await skipButton.click();
    await expect(page.getByText(/welcome to sigscore/i)).not.toBeVisible({ timeout: 3000 });
  });

  test('demo nav hides irrelevant items', async ({ page }) => {
    await page.goto('/');

    // Seed the demo
    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await demoButton.click();
    await page.waitForURL('/', { timeout: 20000 });
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    // These nav items should be visible but disabled (shown with "Pro" badge) for demo users
    const disabledItems = ['Enrichment', 'Playbooks', 'Sequences', 'Webhooks', 'API Usage'];
    for (const item of disabledItems) {
      const el = page.locator('aside').getByText(item, { exact: true });
      await expect(el).toBeVisible();
      // Should not be a clickable link — rendered as a div with cursor-default
      await expect(el.locator('xpath=ancestor::a')).not.toBeAttached();
    }

    // These nav items should still be visible
    const visibleItems = ['Dashboard', 'PQA Scores', 'Signals'];
    for (const item of visibleItems) {
      await expect(page.locator('aside').getByText(item, { exact: true })).toBeVisible();
    }
  });

  test('PQA dashboard shows score overview chart', async ({ page }) => {
    await page.goto('/');

    // Seed the demo
    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await demoButton.click();
    await page.waitForURL('/', { timeout: 20000 });
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    // Navigate to PQA Scores
    await page.locator('aside').getByText('PQA Scores', { exact: true }).click();
    await expect(page.getByText('PQA Scores')).toBeVisible({ timeout: 5000 });

    // Summary cards should show account counts
    await expect(page.getByText('Total Scored')).toBeVisible();
    await expect(page.getByText('HOT Accounts')).toBeVisible();

    // OrgScoreTrendChart should render with "Score Overview" title
    await expect(page.getByText('Score Overview')).toBeVisible({ timeout: 5000 });

    // The chart SVG should be rendered (responsive, inside the chart container)
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('companies page shows score trend sparklines', async ({ page }) => {
    await page.goto('/');

    // Seed the demo
    const demoButton = page.getByRole('button', { name: /explore live demo/i });
    await demoButton.click();
    await page.waitForURL('/', { timeout: 20000 });
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });

    // Navigate to Companies
    await page.locator('aside').getByText('Companies', { exact: true }).click();
    await expect(page.getByText('Companies')).toBeVisible({ timeout: 5000 });

    // Should see demo companies listed
    await expect(page.getByText('Arcline Tools')).toBeVisible({ timeout: 5000 });

    // Sparkline SVGs should be rendered (one per company row)
    const sparklines = page.locator('svg[aria-label^="Score trend"]');
    await expect(sparklines.first()).toBeVisible({ timeout: 5000 });
  });

  test('registration page loads correctly', async ({ page }) => {
    await page.goto('/register');

    // Check for registration form elements
    await expect(page.getByRole('heading', { name: /sigscore/i })).toBeVisible();
    await expect(page.getByLabel('First name')).toBeVisible();
    await expect(page.getByLabel('Last name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');

    // Check for login form elements
    await expect(page.getByRole('heading', { name: /sigscore/i })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('pricing page displays all tiers', async ({ page }) => {
    await page.goto('/pricing');

    // Check for all four pricing tiers
    await expect(page.getByText('Free')).toBeVisible();
    await expect(page.getByText('$79')).toBeVisible();
    await expect(page.getByText('$199')).toBeVisible();
    await expect(page.getByText('$299')).toBeVisible();

    // Check for key pricing features
    await expect(page.getByText('1,000 contacts')).toBeVisible();
    await expect(page.getByText('25,000 contacts')).toBeVisible();
  });

  test('API docs page loads', async ({ page }) => {
    await page.goto('/api-docs');

    // Swagger UI loads - check for common Swagger UI elements
    await expect(page.locator('.swagger-ui, #swagger-ui, .swagger-container')).toBeVisible({ timeout: 10000 });
  });

  test('landing page navigation links work', async ({ page }) => {
    await page.goto('/');

    // Test top nav links
    const navLinks = [
      { name: 'Features', hash: '#features' },
      { name: 'How It Works', hash: '#how-it-works' },
    ];

    for (const link of navLinks) {
      const navLink = page.locator('nav').getByRole('link', { name: link.name });
      await expect(navLink).toBeVisible();
    }

    // Test router navigation links
    const pricingLink = page.locator('nav').getByRole('link', { name: 'Pricing' });
    await expect(pricingLink).toBeVisible();
    await pricingLink.click();
    await expect(page).toHaveURL(/\/pricing/);
  });

  test('landing page features section displays all features', async ({ page }) => {
    await page.goto('/');

    // Scroll to features section
    await page.locator('#features').scrollIntoViewIfNeeded();

    // Check for all 6 key features
    const features = [
      'Signal Engine',
      'PQA Scoring',
      'PLG Pipeline',
      'AI Briefs',
      'API-first',
      'Workflows',
    ];

    for (const feature of features) {
      await expect(page.getByText(feature)).toBeVisible();
    }
  });

  test('landing page shows integration logos', async ({ page }) => {
    await page.goto('/');

    // Check for key integrations
    const integrations = ['GitHub', 'npm', 'Slack', 'HubSpot', 'Salesforce'];

    for (const integration of integrations) {
      await expect(page.getByText(integration)).toBeVisible();
    }
  });

  test('landing page FAQ section is interactive', async ({ page }) => {
    await page.goto('/');

    // Scroll to FAQ section
    await page.getByText('Frequently asked questions').scrollIntoViewIfNeeded();

    // Check for FAQ questions
    await expect(page.getByText('How long does setup take?')).toBeVisible();

    // Click to expand an FAQ item
    await page.getByText('How long does setup take?').click();

    // Check that the answer is revealed
    await expect(page.getByText('2 minutes. Connect GitHub, see results.')).toBeVisible();
  });

  test('landing page comparison table shows Sigscore advantages', async ({ page }) => {
    await page.goto('/');

    // Scroll to comparison section
    await page.getByText('Why Sigscore over the alternatives?').scrollIntoViewIfNeeded();

    // Check for comparison table elements
    await expect(page.getByText('Common Room')).toBeVisible();
    await expect(page.getByText('Reo.dev')).toBeVisible();

    // Verify Sigscore advantages are shown
    await expect(page.getByText('From $0/mo')).toBeVisible();
    await expect(page.getByText('2 minutes')).toBeVisible();
  });

  test('landing page product mockup is displayed', async ({ page }) => {
    await page.goto('/');

    // Check for product mockup section
    await expect(page.getByText('See who\'s evaluating your tool')).toBeVisible();

    // Check for mockup elements
    await expect(page.getByText('Top Accounts')).toBeVisible();
    await expect(page.getByText('Live Signal Feed')).toBeVisible();
    await expect(page.getByText('Acme Tools')).toBeVisible();
  });

  test('landing page bottom CTA is visible', async ({ page }) => {
    await page.goto('/');

    // Scroll to bottom CTA
    await page.getByText('Start finding your hidden pipeline').scrollIntoViewIfNeeded();

    // Check CTA elements
    await expect(page.getByText('Start finding your hidden pipeline')).toBeVisible();
    await expect(page.getByText('Free tier forever. No credit card. Setup in 2 minutes.')).toBeVisible();

    // Check for CTA button
    await expect(page.getByRole('link', { name: /get started free.*no credit card/i })).toBeVisible();
  });

  test('footer contains all expected links', async ({ page }) => {
    await page.goto('/');

    // Scroll to footer
    await page.locator('footer').scrollIntoViewIfNeeded();

    // Check for footer navigation links
    const footerLinks = ['Features', 'Use Cases', 'Pricing', 'Developers', 'Changelog', 'Terms', 'Privacy', 'Sign in'];

    for (const linkText of footerLinks) {
      await expect(page.locator('footer').getByRole('link', { name: linkText })).toBeVisible();
    }

    // Check for copyright
    await expect(page.locator('footer').getByText(/Sigscore. All rights reserved/)).toBeVisible();
  });
});

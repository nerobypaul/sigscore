/**
 * Visual Audit Script — Screenshots every page in Sigscore for visual UX review.
 *
 * Usage: npx tsx scripts/visual-audit.ts
 *
 * 1. Seeds demo data via the /api/v1/demo/seed endpoint
 * 2. Injects auth tokens into localStorage before each page navigation
 * 3. Dismisses overlays (cookie consent, onboarding tour) for clean screenshots
 * 4. Takes full-page screenshots of all public and authenticated pages
 * 5. Saves to /tmp/sigscore-visual-audit/
 */
import { chromium, Page, BrowserContext } from 'playwright';
import { mkdirSync, readdirSync } from 'fs';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3001';
const OUTPUT_DIR = '/tmp/sigscore-visual-audit';

// Tokens from demo seed — populated in Phase 2
let AUTH_TOKENS = {
  accessToken: '',
  refreshToken: '',
  organizationId: '',
};

// Public pages (no auth required)
const PUBLIC_PAGES = [
  { path: '/', name: '01-landing' },
  { path: '/pricing', name: '02-pricing' },
  { path: '/login', name: '03-login' },
  { path: '/register', name: '04-register' },
  { path: '/changelog', name: '05-changelog' },
  { path: '/terms', name: '06-terms' },
  { path: '/privacy', name: '07-privacy' },
  { path: '/dpa', name: '08-dpa' },
  { path: '/acceptable-use', name: '09-aup' },
  { path: '/compare/common-room', name: '10-compare-commonroom' },
  { path: '/compare/reo-dev', name: '11-compare-reodev' },
];

// Authenticated pages (need demo token)
const AUTH_PAGES = [
  { path: '/', name: '20-dashboard' },
  { path: '/contacts', name: '21-contacts' },
  { path: '/companies', name: '22-companies' },
  { path: '/signals', name: '23-signals' },
  { path: '/signals/feed', name: '24-signal-feed' },
  { path: '/scores', name: '25-pqa-scores' },
  { path: '/reports', name: '26-reports' },
  { path: '/deals', name: '27-deals' },
  { path: '/analytics', name: '28-analytics' },
  { path: '/alerts', name: '29-alerts' },
  { path: '/workflows', name: '30-workflows' },
  { path: '/playbooks', name: '31-playbooks' },
  { path: '/sequences', name: '32-sequences' },
  { path: '/enrichment', name: '33-enrichment' },
  { path: '/integrations', name: '34-integrations' },
  { path: '/settings', name: '35-settings' },
  { path: '/settings?tab=hubspot', name: '36-settings-hubspot' },
  { path: '/webhooks', name: '37-webhooks' },
  { path: '/api-usage', name: '38-api-usage' },
  { path: '/scoring', name: '39-scoring-builder' },
  { path: '/team', name: '40-team' },
  { path: '/billing', name: '41-billing' },
  { path: '/audit', name: '42-audit-log' },
  { path: '/dev-portal', name: '43-dev-portal' },
  { path: '/api-docs', name: '44-api-docs' },
];

/**
 * Inject auth tokens into localStorage BEFORE navigating.
 * Uses page.addInitScript so tokens are set before any JS runs on the page.
 */
async function setupAuthContext(context: BrowserContext): Promise<void> {
  await context.addInitScript(
    ({ accessToken, refreshToken, organizationId }) => {
      // Only inject tokens if not already present — avoids overwriting
      // rotated tokens from a successful refresh flow.
      if (!localStorage.getItem('accessToken')) {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        if (organizationId) localStorage.setItem('organizationId', organizationId);
      }
      // Dismiss cookie consent (key: sigscore-cookie-consent)
      localStorage.setItem('sigscore-cookie-consent', 'essential');
      // Dismiss onboarding checklist (key: sigscore_onboarding_checklist_dismissed)
      localStorage.setItem('sigscore_onboarding_checklist_dismissed', '1');
      // Dismiss getting started (key: sigscore_onboarding_dismissed)
      localStorage.setItem('sigscore_onboarding_dismissed', '1');
      // Dismiss demo tour (key: sigscore-demo-tour-seen) — uses sessionStorage
      sessionStorage.setItem('sigscore-demo-tour-seen', '1');
    },
    AUTH_TOKENS,
  );
}

/**
 * Dismiss any floating overlays that block the page content.
 */
async function dismissOverlays(page: Page): Promise<void> {
  // Dismiss cookie consent banner if visible
  try {
    const cookieBtn = page.getByRole('button', { name: /accept all|essential only/i });
    if (await cookieBtn.first().isVisible({ timeout: 1000 })) {
      await cookieBtn.first().click();
      await page.waitForTimeout(300);
    }
  } catch { /* no cookie banner */ }

  // Dismiss onboarding hints if visible
  try {
    const skipBtn = page.getByRole('button', { name: /skip|dismiss|close/i });
    if (await skipBtn.first().isVisible({ timeout: 1000 })) {
      await skipBtn.first().click();
      await page.waitForTimeout(300);
    }
  } catch { /* no onboarding */ }
}

/**
 * Navigate to a page and take a screenshot.
 */
async function screenshotPage(
  page: Page,
  path: string,
  name: string,
  suffix: string,
  waitMs = 1000,
): Promise<boolean> {
  try {
    await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(waitMs);
    await dismissOverlays(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `${OUTPUT_DIR}/${name}-${suffix}.png`,
      fullPage: true,
    });
    console.log(`  [OK] ${name}-${suffix}`);
    return true;
  } catch (e) {
    console.log(`  [FAIL] ${name}-${suffix}: ${(e as Error).message.slice(0, 80)}`);
    return false;
  }
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // --- Phase 1: Public pages (desktop + mobile) ---
  console.log('\n=== PHASE 1: Public Pages ===\n');

  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const desktopPage = await desktopContext.newPage();

  for (const { path, name } of PUBLIC_PAGES) {
    await screenshotPage(desktopPage, path, name, 'desktop', 500);
  }

  // Mobile viewport for key public pages
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();

  const mobilePublicPages = PUBLIC_PAGES.filter((p) =>
    ['01-landing', '02-pricing', '03-login', '04-register'].includes(p.name),
  );

  for (const { path, name } of mobilePublicPages) {
    await screenshotPage(mobilePage, path, name, 'mobile', 500);
  }

  await mobileContext.close();
  await desktopContext.close();

  // --- Phase 2: Seed demo data via API ---
  console.log('\n=== PHASE 2: Seeding Demo Data ===\n');

  try {
    const resp = await fetch(`${API_URL}/api/v1/demo/seed`, { method: 'POST' });
    const data = await resp.json();

    if (data.accessToken) {
      AUTH_TOKENS = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || '',
        organizationId: data.organizationId || '',
      };
      console.log(`  Demo seeded! Org: ${AUTH_TOKENS.organizationId}`);
      console.log(`  Token: ${AUTH_TOKENS.accessToken.slice(0, 20)}...`);
    } else {
      console.log(`  WARNING: No accessToken in response: ${JSON.stringify(data).slice(0, 200)}`);
    }
  } catch (e) {
    console.log(`  FATAL: Demo seed failed: ${(e as Error).message}`);
    await browser.close();
    process.exit(1);
  }

  // Verify the token works by calling /auth/me
  try {
    const meResp = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${AUTH_TOKENS.accessToken}`,
        'X-Organization-Id': AUTH_TOKENS.organizationId,
      },
    });
    const meData = await meResp.json();
    console.log(`  Token verified! User: ${meData.email} (${meData.firstName} ${meData.lastName})`);
  } catch (e) {
    console.log(`  WARNING: Token verification failed: ${(e as Error).message}`);
  }

  // --- Phase 3: Authenticated pages (desktop) ---
  console.log('\n=== PHASE 3: Authenticated Pages (Desktop) ===\n');

  const authDesktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  // Inject tokens BEFORE any navigation via addInitScript
  await setupAuthContext(authDesktopContext);
  const authDesktopPage = await authDesktopContext.newPage();

  for (const { path, name } of AUTH_PAGES) {
    await screenshotPage(authDesktopPage, path, name, 'desktop');
  }

  // --- Phase 4: Authenticated pages (mobile) for key screens ---
  console.log('\n=== PHASE 4: Authenticated Pages (Mobile) ===\n');

  const mobileAuthContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await setupAuthContext(mobileAuthContext);
  const mobileAuthPage = await mobileAuthContext.newPage();

  const mobileAuthPages = AUTH_PAGES.filter((p) =>
    [
      '20-dashboard',
      '21-contacts',
      '22-companies',
      '25-pqa-scores',
      '27-deals',
      '34-integrations',
      '35-settings',
      '39-scoring-builder',
    ].includes(p.name),
  );

  for (const { path, name } of mobileAuthPages) {
    await screenshotPage(mobileAuthPage, path, name, 'mobile');
  }

  // --- Phase 5: Interaction screenshots (open modals, forms) ---
  console.log('\n=== PHASE 5: Interaction Screenshots ===\n');

  try {
    // Contact creation form
    await authDesktopPage.goto(`${BASE_URL}/contacts`, { waitUntil: 'networkidle', timeout: 20000 });
    await authDesktopPage.waitForTimeout(1000);
    await dismissOverlays(authDesktopPage);
    const addContactBtn = authDesktopPage.getByRole('button', { name: /add contact|new contact|create/i });
    if (await addContactBtn.isVisible({ timeout: 3000 })) {
      await addContactBtn.click();
      await authDesktopPage.waitForTimeout(500);
      await authDesktopPage.screenshot({
        path: `${OUTPUT_DIR}/50-create-contact-modal-desktop.png`,
        fullPage: true,
      });
      console.log('  [OK] create-contact-modal');
    } else {
      console.log('  [SKIP] create-contact-modal: button not visible');
    }
  } catch (e) {
    console.log(`  [SKIP] create-contact-modal: ${(e as Error).message.slice(0, 60)}`);
  }

  try {
    // Deal creation form
    await authDesktopPage.goto(`${BASE_URL}/deals`, { waitUntil: 'networkidle', timeout: 20000 });
    await authDesktopPage.waitForTimeout(1000);
    await dismissOverlays(authDesktopPage);
    const addDealBtn = authDesktopPage.getByRole('button', { name: /new deal|add deal|create/i });
    if (await addDealBtn.isVisible({ timeout: 3000 })) {
      await addDealBtn.click();
      await authDesktopPage.waitForTimeout(500);
      await authDesktopPage.screenshot({
        path: `${OUTPUT_DIR}/51-create-deal-modal-desktop.png`,
        fullPage: true,
      });
      console.log('  [OK] create-deal-modal');
    } else {
      console.log('  [SKIP] create-deal-modal: button not visible');
    }
  } catch (e) {
    console.log(`  [SKIP] create-deal-modal: ${(e as Error).message.slice(0, 60)}`);
  }

  try {
    // Workflow creation form
    await authDesktopPage.goto(`${BASE_URL}/workflows`, { waitUntil: 'networkidle', timeout: 20000 });
    await authDesktopPage.waitForTimeout(1000);
    await dismissOverlays(authDesktopPage);
    const createBtn = authDesktopPage.getByRole('button', { name: /create workflow|new workflow/i });
    if (await createBtn.isVisible({ timeout: 3000 })) {
      await createBtn.click();
      await authDesktopPage.waitForTimeout(500);
      await authDesktopPage.screenshot({
        path: `${OUTPUT_DIR}/52-create-workflow-form-desktop.png`,
        fullPage: true,
      });
      console.log('  [OK] create-workflow-form');
    } else {
      console.log('  [SKIP] create-workflow-form: button not visible');
    }
  } catch (e) {
    console.log(`  [SKIP] create-workflow-form: ${(e as Error).message.slice(0, 60)}`);
  }

  // Cleanup
  await mobileAuthContext.close();
  await authDesktopContext.close();
  await browser.close();

  console.log(`\n=== DONE: Screenshots saved to ${OUTPUT_DIR}/ ===\n`);
  console.log(`Total files: ${readdirSync(OUTPUT_DIR).length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

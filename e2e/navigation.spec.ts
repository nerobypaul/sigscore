import { test, expect } from '@playwright/test';
import { createTestUser, TestUser } from './helpers/api';
import { injectAuth } from './helpers/auth';

let user: TestUser;

test.beforeAll(async ({ request }) => {
  user = await createTestUser(request);
});

test.beforeEach(async ({ page }) => {
  await injectAuth(page, user);
});

test.describe('Sidebar navigation', () => {
  const navLinks = [
    { label: 'Dashboard', path: '/' },
    { label: 'Contacts', path: '/contacts' },
    { label: 'Companies', path: '/companies' },
    { label: 'Deals', path: '/deals' },
    { label: 'Activities', path: '/activities' },
    { label: 'Signals', path: '/signals' },
    { label: 'PQA Scores', path: '/scores' },
    { label: 'Workflows', path: '/workflows' },
    { label: 'Settings', path: '/settings' },
    { label: 'Billing', path: '/billing' },
  ];

  for (const { label, path } of navLinks) {
    test(`sidebar link "${label}" navigates to ${path}`, async ({ page }) => {
      // The sidebar is in an <aside> element
      const sidebar = page.locator('aside');
      const link = sidebar.getByRole('link', { name: label });

      await expect(link).toBeVisible();
      await link.click();

      // For the Dashboard route "/" we need an exact match; for others a startsWith check
      if (path === '/') {
        await expect(page).toHaveURL(/\/$/);
      } else {
        await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
      }
    });
  }

  test('all sidebar links are present', async ({ page }) => {
    const sidebar = page.locator('aside');
    for (const { label } of navLinks) {
      await expect(sidebar.getByRole('link', { name: label })).toBeVisible();
    }
  });
});

test.describe('404 page', () => {
  test('shows 404 for nonexistent page', async ({ page }) => {
    // Clear auth so we can access the 404 route directly (it is outside the protected layout)
    await page.goto('/nonexistent-page-xyz');

    // The NotFound component renders "404" and "Page not found"
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test.describe('Authentication redirect', () => {
  test('redirects to /login when unauthenticated', async ({ page }) => {
    // Clear all auth tokens from localStorage
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('organizationId');
    });

    // Attempt to visit a protected route
    await page.goto('/contacts');

    // Should be redirected to the login page
    await expect(page).toHaveURL(/\/login/);
  });
});

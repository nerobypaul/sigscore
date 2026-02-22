import { Page } from '@playwright/test';
import { TestUser } from './api';

/**
 * Logs in via the UI login form.
 */
export async function loginViaUI(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

/**
 * Sets auth tokens directly in localStorage so the app boots as authenticated.
 * Faster than going through the login form for every test.
 */
export async function injectAuth(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.evaluate(
    ({ accessToken, refreshToken, organizationId }) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('organizationId', organizationId);
    },
    user,
  );
  // Navigate to dashboard — the app will read tokens from localStorage
  await page.goto('/');
}

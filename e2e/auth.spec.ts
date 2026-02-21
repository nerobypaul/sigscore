import { test, expect } from '@playwright/test';
import { createTestUser } from './helpers/api';
import { loginViaUI, injectAuth } from './helpers/auth';

/**
 * Generate a unique email address for each test to avoid collisions.
 */
function uniqueEmail(): string {
  return `e2e-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.sigscore.dev`;
}

test.describe('Authentication flows', () => {
  test.describe('Registration', () => {
    test('should register a new user and redirect to /onboarding', async ({ page }) => {
      const email = uniqueEmail();
      const password = 'TestPass123!';
      const firstName = 'Alice';
      const lastName = 'Tester';

      await page.goto('/register');

      // Verify the registration form is visible
      await expect(page.getByRole('heading', { name: /headless crm/i })).toBeVisible();

      // Fill in the registration form
      await page.getByLabel('First name').fill(firstName);
      await page.getByLabel('Last name').fill(lastName);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(password);

      // Submit
      await page.getByRole('button', { name: /create account/i }).click();

      // A newly registered user without an org should be redirected to /onboarding
      await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
    });

    test('should navigate to login page via "Sign in" link', async ({ page }) => {
      await page.goto('/register');

      await page.getByRole('link', { name: /sign in/i }).click();

      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Login', () => {
    test('should login with valid credentials and see the dashboard', async ({
      page,
      request,
    }) => {
      // Create a user with an organization via the API so login redirects to /
      const user = await createTestUser(request);

      await loginViaUI(page, user.email, user.password);

      // After login, user with an org should land on the dashboard (/)
      await expect(page).toHaveURL(/^\/$|\/$/,  { timeout: 10_000 });

      // Verify the sidebar is rendered with the user's name
      await expect(page.getByText(`${user.firstName} ${user.lastName}`)).toBeVisible();
    });

    test('should navigate to register page via "Sign up" link', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('link', { name: /sign up/i }).click();

      await expect(page).toHaveURL(/\/register/);
    });
  });

  test.describe('Login with bad credentials', () => {
    test('should show an error message for invalid email/password', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel('Email').fill('nonexistent@test.sigscore.dev');
      await page.getByLabel('Password').fill('WrongPassword999!');
      await page.getByRole('button', { name: /sign in/i }).click();

      // The error alert should appear
      const errorAlert = page.locator('.bg-red-50.text-red-700');
      await expect(errorAlert).toBeVisible({ timeout: 10_000 });
      await expect(errorAlert).toContainText(/failed|invalid|incorrect|not found/i);

      // User should remain on the login page
      await expect(page).toHaveURL(/\/login/);
    });

    test('should show an error for correct email but wrong password', async ({
      page,
      request,
    }) => {
      const user = await createTestUser(request);

      await page.goto('/login');

      await page.getByLabel('Email').fill(user.email);
      await page.getByLabel('Password').fill('CompletelyWrong!');
      await page.getByRole('button', { name: /sign in/i }).click();

      const errorAlert = page.locator('.bg-red-50.text-red-700');
      await expect(errorAlert).toBeVisible({ timeout: 10_000 });

      // Should stay on login
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('Logout', () => {
    test('should log out and redirect to /login', async ({ page, request }) => {
      const user = await createTestUser(request);

      // Inject auth tokens to skip the login form (faster setup)
      await injectAuth(page, user);

      // Confirm we are on the dashboard
      await expect(page).toHaveURL(/^\/$|\/$/,  { timeout: 10_000 });

      // Click the "Sign out" button in the sidebar
      await page.getByRole('button', { name: /sign out/i }).click();

      // Should redirect to /login
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

      // Verify localStorage tokens have been cleared
      const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'));
      expect(accessToken).toBeNull();
    });

    test('should not allow access to dashboard after logout', async ({ page, request }) => {
      const user = await createTestUser(request);

      await injectAuth(page, user);
      await expect(page).toHaveURL(/^\/$|\/$/,  { timeout: 10_000 });

      // Log out
      await page.getByRole('button', { name: /sign out/i }).click();
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

      // Try navigating directly to the dashboard
      await page.goto('/');

      // Should be redirected back to /login (ProtectedRoute)
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    });
  });
});

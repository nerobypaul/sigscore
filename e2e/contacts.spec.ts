import { test, expect, Page } from '@playwright/test';
import { createTestUser, authHeaders, TestUser } from './helpers/api';
import { injectAuth } from './helpers/auth';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api/v1';

test.describe('Contacts CRUD', () => {
  let user: TestUser;

  test.beforeAll(async ({ request }) => {
    user = await createTestUser(request);
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, user);
  });

  test.describe('Create contact', () => {
    test('should open the create modal, fill the form, and add a new contact', async ({ page }) => {
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      // Click "Add Contact" button
      await page.getByRole('button', { name: 'Add Contact' }).click();

      // Modal should appear with the "New Contact" heading
      await expect(page.getByRole('heading', { name: 'New Contact' })).toBeVisible();

      // Fill in the form fields
      await page.getByLabel('First name').fill('Alice');
      await page.getByLabel('Last name').fill('Testington');
      await page.getByLabel('Email').fill('alice.testington@example.com');
      await page.getByLabel('Phone').fill('+1-555-0100');
      await page.getByLabel('Title').fill('VP of Engineering');

      // Submit the form
      await page.getByRole('button', { name: 'Create Contact' }).click();

      // Modal should close and the new contact should appear in the table
      await expect(page.getByRole('heading', { name: 'New Contact' })).not.toBeVisible();
      await expect(page.getByText('Alice Testington')).toBeVisible();
    });
  });

  test.describe('View contact detail', () => {
    let contactId: string;

    test.beforeAll(async ({ request }) => {
      // Seed a contact via the API so this test group is self-contained
      const res = await request.post(`${API_BASE}/contacts`, {
        headers: authHeaders(user),
        data: {
          firstName: 'Bob',
          lastName: 'DetailView',
          email: 'bob.detail@example.com',
          title: 'CTO',
          phone: '+1-555-0200',
        },
      });
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      contactId = body.id;
    });

    test('should navigate to contact detail and display full info', async ({ page }) => {
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      // Click on the contact row containing "Bob DetailView"
      await page.getByText('Bob DetailView').click();

      // Should be on the detail page
      await page.waitForURL(/\/contacts\/.+/);

      // Verify the heading shows the contact name
      await expect(page.getByRole('heading', { name: 'Bob DetailView' })).toBeVisible();

      // Verify contact information fields are displayed
      await expect(page.getByText('bob.detail@example.com')).toBeVisible();
      await expect(page.getByText('+1-555-0200')).toBeVisible();
      await expect(page.getByText('CTO')).toBeVisible();

      // The "Contact Information" section should be present
      await expect(page.getByRole('heading', { name: 'Contact Information' })).toBeVisible();
    });

    test('should be reachable via direct URL', async ({ page }) => {
      await page.goto(`/contacts/${contactId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'Bob DetailView' })).toBeVisible();
    });
  });

  test.describe('Search and filter contacts', () => {
    test.beforeAll(async ({ request }) => {
      // Seed multiple contacts to search through
      const contacts = [
        { firstName: 'Carol', lastName: 'Searchable', email: 'carol@example.com', title: 'CEO' },
        { firstName: 'Dave', lastName: 'Findable', email: 'dave@example.com', title: 'Engineer' },
        { firstName: 'Eve', lastName: 'Invisible', email: 'eve@example.com', title: 'Designer' },
      ];
      for (const contact of contacts) {
        const res = await request.post(`${API_BASE}/contacts`, {
          headers: authHeaders(user),
          data: contact,
        });
        expect(res.ok()).toBeTruthy();
      }
    });

    test('should filter contacts by name when typing in the search input', async ({ page }) => {
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      const searchInput = page.getByPlaceholder('Search contacts by name or email...');
      await expect(searchInput).toBeVisible();

      // Search for "Carol" -- should show Carol, hide Dave and Eve
      await searchInput.fill('Carol');

      // Wait for the debounce (300ms) and network request to complete
      await expect(page.getByText('Carol Searchable')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Dave Findable')).not.toBeVisible();
      await expect(page.getByText('Eve Invisible')).not.toBeVisible();
    });

    test('should show "No contacts match" when search yields no results', async ({ page }) => {
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      const searchInput = page.getByPlaceholder('Search contacts by name or email...');
      await searchInput.fill('zzz_nonexistent_zzz');

      // Wait for the debounce and request
      await expect(page.getByText('No contacts match your search')).toBeVisible({ timeout: 5000 });
    });

    test('should clear search and show all contacts again', async ({ page }) => {
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      const searchInput = page.getByPlaceholder('Search contacts by name or email...');

      // First search to narrow down
      await searchInput.fill('Carol');
      await expect(page.getByText('Carol Searchable')).toBeVisible({ timeout: 5000 });

      // Clear search to restore full list
      await searchInput.clear();
      await expect(page.getByText('Carol Searchable')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Dave Findable')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Delete contact', () => {
    let contactName: string;

    test.beforeAll(async ({ request }) => {
      // Seed a contact specifically for deletion
      const res = await request.post(`${API_BASE}/contacts`, {
        headers: authHeaders(user),
        data: {
          firstName: 'Zara',
          lastName: 'Deletable',
          email: 'zara.deletable@example.com',
          title: 'Intern',
          phone: '+1-555-0999',
        },
      });
      expect(res.ok()).toBeTruthy();
      contactName = 'Zara Deletable';
    });

    test('should delete a contact from the detail page with confirmation', async ({ page }) => {
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      // Navigate to the contact detail
      await page.getByText(contactName).click();
      await page.waitForURL(/\/contacts\/.+/);
      await expect(page.getByRole('heading', { name: contactName })).toBeVisible();

      // Set up the dialog handler to accept the confirmation BEFORE clicking
      page.on('dialog', (dialog) => dialog.accept());

      // Click the delete button
      await page.getByRole('button', { name: 'Delete' }).click();

      // Should redirect back to the contacts list
      await page.waitForURL('/contacts');

      // The deleted contact should no longer appear
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(contactName)).not.toBeVisible();
    });

    test('should cancel deletion when the confirmation dialog is dismissed', async ({ page, request }) => {
      // Seed another contact for the cancel test
      const res = await request.post(`${API_BASE}/contacts`, {
        headers: authHeaders(user),
        data: {
          firstName: 'Yuki',
          lastName: 'Keepable',
          email: 'yuki.keepable@example.com',
          title: 'Manager',
        },
      });
      expect(res.ok()).toBeTruthy();

      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');

      // Navigate to the contact detail
      await page.getByText('Yuki Keepable').click();
      await page.waitForURL(/\/contacts\/.+/);
      await expect(page.getByRole('heading', { name: 'Yuki Keepable' })).toBeVisible();

      // Dismiss the confirmation dialog
      page.on('dialog', (dialog) => dialog.dismiss());

      // Click the delete button
      await page.getByRole('button', { name: 'Delete' }).click();

      // Should stay on the detail page -- contact is NOT deleted
      await expect(page.getByRole('heading', { name: 'Yuki Keepable' })).toBeVisible();

      // Verify the contact still exists by going back to the list
      await page.goto('/contacts');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Yuki Keepable')).toBeVisible();
    });
  });
});

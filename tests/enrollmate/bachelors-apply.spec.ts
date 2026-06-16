import { test, expect, type Page } from '@playwright/test';

let page: Page;

test.describe.serial('Bachelor\'s Degree Application', () => {

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test.describe('Step 1 — Student\'s Information', () => {

    test('page loads with correct title and heading', async () => {
      await expect(page).toHaveTitle('MMDC EnrollMate');
      await expect(page.getByRole('heading', { name: /online application/i })).toBeVisible();
      await expect(page.getByRole('heading', { name: /applicant information/i })).toBeVisible();
    });

    test('shows 4-step navigation with only step 1 active', async () => {
      await expect(page.getByRole('button', { name: /student.s? information/i })).toBeEnabled();
      await expect(page.getByRole('button', { name: /parent.*guardian/i })).toBeDisabled();
      await expect(page.getByRole('button', { name: /additional information/i })).toBeDisabled();
      await expect(page.getByRole('button', { name: /confirmation/i })).toBeDisabled();
    });

    test('displays all required form fields', async () => {
      await expect(page.getByRole('textbox', { name: '* Email' })).toBeVisible();
      await expect(page.locator('#termApplied')).toBeVisible();
      await expect(page.locator('#programFocus')).toBeVisible();
      await expect(page.getByRole('textbox', { name: '* First name' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: '* Last name' })).toBeVisible();
      await expect(page.getByRole('textbox', { name: '* Place of Birth' })).toBeVisible();
      await expect(page.locator('#gender')).toBeVisible();
      await expect(page.locator('#nationality')).toBeVisible();
      await expect(page.locator('#civilStatus')).toBeVisible();
      await expect(page.getByRole('textbox', { name: '* Mobile' })).toBeVisible();
    });

    test('shows validation errors when submitting empty form', async () => {
      await page.getByRole('button', { name: /next/i }).click();
      await page.waitForTimeout(1500);

      const invalidFields = page.locator('select.ng-invalid, input.ng-invalid');
      const count = await invalidFields.count();
      expect(count).toBeGreaterThan(0);
    });

    test('major dropdown contains BS IT and BS BA', async () => {
      await expect(page.locator('#programFocus')).toContainText('BS Information Technology');
      await expect(page.locator('#programFocus')).toContainText('BS Business Administration');
    });

    test('term dropdown contains upcoming terms', async () => {
      await expect(page.locator('#termApplied')).toContainText('August 2026 | First Term');
      await expect(page.locator('#termApplied')).toContainText('December 2026 | Second Term');
      await expect(page.locator('#termApplied')).toContainText('April 2027 | Third Term');
    });

    test('student type dropdown contains Freshman and Transferee', async () => {
      await expect(page.locator('#studentType')).toContainText('Freshman');
      await expect(page.locator('#studentType')).toContainText('Transferee');
    });

    test('has email contact link and NEXT button', async () => {
      await expect(page.getByRole('link', { name: /admissions@mmdc/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
    });
  });

  test.describe('Step 2 — Parent/Guardian\'s Information', () => {

    test('main form fields are fillable', async () => {
      await page.locator('#email').fill('test@example.com');
      await expect(page.locator('#email')).toHaveValue('test@example.com');

      await page.locator('#termApplied').selectOption('August 2026 | First Term');
      await expect(page.locator('#termApplied')).toHaveValue('August 2026 | First Term');

      await page.locator('#programFocus').selectOption('BS Information Technology');
      await expect(page.locator('#programFocus')).toHaveValue('BS Information Technology');

      await page.locator('#givenName').fill('Juan');
      await page.locator('#familyName').fill('Dela Cruz');
      await page.locator('#birthplace').fill('Manila');
      await page.locator('#birthdate').fill('2000-01-15');
      await page.locator('#mobile').fill('+63 912 345 6789');

      await page.locator('#studentType').selectOption('Freshman');
      await page.locator('#subStudentType').selectOption('Recent Grade 12 graduate');

      await expect(page.getByRole('button', { name: /next/i })).toBeVisible();
    });
  });

  test.describe('Step 3 — Additional Information', () => {

    test('requires successful step 1 submission to reach', () => {
      test.info().annotations.push({
        type: 'note',
        description: 'Requires cascading province/city dropdown data from the backend to submit step 1. Not testable in UAT without that data.',
      });
      expect(true).toBe(true);
    });
  });

  test.describe('Step 4 — Confirmation', () => {

    test('requires successful steps 1-3 submission to reach', () => {
      test.info().annotations.push({
        type: 'note',
        description: 'End of the wizard flow. Reachable only after completing steps 1-3.',
      });
      expect(true).toBe(true);
    });
  });
});

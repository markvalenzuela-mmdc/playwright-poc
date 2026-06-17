import type { Locator, Page } from '@playwright/test';
import type { CriticalPathContract, FormContract, PageElementContract, PrimaryCtaContract } from '../contracts';
import { findFirstActionable, firstVisible, locatorToString, resolveLocator } from './locators';

export type ElementCheck = { locator: string; ok: boolean };

export async function checkLoadedPage(page: Page, contract: CriticalPathContract, websiteOrigin: string) {
  const issues: string[] = [];
  const finalUrl = page.url();
  const finalOrigin = new URL(finalUrl).origin;

  if (contract.expectedUrlPattern) {
    if (!contract.expectedUrlPattern.test(finalUrl)) {
      issues.push(`Final URL mismatch for expected pattern ${String(contract.expectedUrlPattern)}`);
    }
  } else if (finalOrigin !== websiteOrigin) {
    issues.push(`Unexpected origin redirect (${finalOrigin})`);
  }

  const title = (await page.title()).trim();
  if (title.length === 0) {
    issues.push('Empty title');
  }

  if (contract.expectedTitlePattern && !contract.expectedTitlePattern.test(title)) {
    issues.push(`Title mismatch for expected pattern ${String(contract.expectedTitlePattern)}`);
  }

  return { finalUrl, title, issues };
}

export async function checkRequiredElements(page: Page, contract: PageElementContract) {
  const checks: ElementCheck[] = [];
  const issues: string[] = [];

  for (const locatorContract of contract.requiredLocators) {
    const locator = resolveLocator(page, locatorContract);
    const visible = await firstVisible(locator);
    const ok = visible !== null;
    checks.push({ locator: locatorToString(locatorContract), ok });
    if (!ok) issues.push(`Missing required element: ${locatorToString(locatorContract)}`);
  }

  if (contract.forbiddenTextPatterns && contract.forbiddenTextPatterns.length > 0) {
    const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
    for (const forbiddenPattern of contract.forbiddenTextPatterns) {
      if (forbiddenPattern.test(bodyText)) {
        issues.push(`Forbidden page text matched: ${String(forbiddenPattern)}`);
      }
    }
  }

  return { checks, issues };
}

export async function runCtaCheck(
  page: Page,
  contract: PrimaryCtaContract
): Promise<{ ok: boolean; destination?: string; issue?: string }> {
  const locator = resolveLocator(page, contract.locator);
  const cta = await findFirstActionable(locator, page);
  if (!cta) {
    return { ok: false, issue: `Actionable CTA not found: ${locatorToString(contract.locator)}` };
  }

  const popupPromise = contract.allowPopup
    ? page.waitForEvent('popup', { timeout: 5000 }).catch(() => null)
    : Promise.resolve(null);

  const beforeUrl = page.url();
  try {
    await cta.click({ timeout: 8000 });
  } catch {
    // Fallback for sticky/header interception: keyboard activation after focus.
    await cta.focus();
    await page.keyboard.press('Enter');
  }

  const popup = await popupPromise;
  const activePage = popup ?? page;

  await activePage.waitForLoadState('domcontentloaded', { timeout: 15000 });
  const destination = activePage.url();

  if (contract.expect.mode === 'urlRegex') {
    if (!contract.expect.urlRegex.test(destination)) {
      const failure = {
        ok: false,
        destination,
        issue: `CTA destination did not match expected pattern ${String(contract.expect.urlRegex)}`,
      };
      if (popup) await popup.close().catch(() => {});
      return failure;
    }
  } else {
    if (destination !== beforeUrl) {
      const failure = {
        ok: false,
        destination,
        issue: 'CTA changed URL while same-page state was expected',
      };
      if (popup) await popup.close().catch(() => {});
      return failure;
    }

    const stableLocator = resolveLocator(activePage, contract.expect.stableLocator);
    const visible = await firstVisible(stableLocator);
    if (!visible) {
      const failure = {
        ok: false,
        destination,
        issue: `Same-page state locator not visible: ${locatorToString(contract.expect.stableLocator)}`,
      };
      if (popup) await popup.close().catch(() => {});
      return failure;
    }
  }

  if (popup) await popup.close().catch(() => {});
  return { ok: true, destination };
}

async function fillField(locator: Locator, value: string) {
  const tagName = (await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '')) as string;
  const type = ((await locator.getAttribute('type')) ?? '').toLowerCase();

  if (tagName === 'select') {
    await locator.selectOption({ label: value }).catch(async () => {
      await locator.selectOption({ value }).catch(async () => {
        await locator.selectOption({ index: 0 });
      });
    });
    return;
  }

  if (type === 'checkbox' || type === 'radio') {
    await locator.check();
    return;
  }

  await locator.fill(value);
}

export async function runFormCheck(page: Page, contract: FormContract): Promise<{ ok: boolean; details: string[] }> {
  const details: string[] = [];
  const form = await firstVisible(resolveLocator(page, contract.formLocator));

  if (!form) {
    if (!contract.required) {
      return {
        ok: true,
        details: [`Optional form not present, skipped: ${locatorToString(contract.formLocator)}`],
      };
    }

    return {
      ok: false,
      details: [`Form not found: ${locatorToString(contract.formLocator)}`],
    };
  }

  const beforeUrl = page.url();

  for (const field of contract.fields) {
    const input = await firstVisible(resolveLocator(form, field.locator));
    if (!input) {
      if (field.optional) {
        details.push(`Optional field missing: ${field.name}`);
        continue;
      }

      return {
        ok: false,
        details: [`Required field missing: ${field.name} (${locatorToString(field.locator)})`],
      };
    }

    await fillField(input, field.value);
    details.push(`Filled field: ${field.name}`);
  }

  for (const expectation of contract.validationExpectations) {
    if (expectation.type === 'atLeastOneRequiredField') {
      const requiredCount = await form.locator('input[required], select[required], textarea[required]').count();
      if (requiredCount < 1) {
        return { ok: false, details: [...details, 'No required fields detected in form'] };
      }
      details.push(`Required fields detected: ${requiredCount}`);
      continue;
    }

    if (expectation.type === 'requiredFieldInvalidWhenBlank') {
      const requiredField = await firstVisible(resolveLocator(form, expectation.field));
      if (!requiredField) {
        details.push('Skipped required-field-invalid check: no matching field found');
        continue;
      }

      await requiredField.fill('');
      await requiredField.blur();
      const isInvalid = await requiredField.evaluate((el) => {
        if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
          return false;
        }
        return !el.checkValidity();
      });

      if (!isInvalid) {
        return { ok: false, details: [...details, 'Required field did not become invalid when blank'] };
      }

      details.push('Required field invalid state verified when blank');
      continue;
    }

    if (expectation.type === 'noNavigationDuringFill') {
      const afterUrl = page.url();
      if (afterUrl !== beforeUrl) {
        return { ok: false, details: [...details, `URL changed during form fill: ${beforeUrl} -> ${afterUrl}`] };
      }
      details.push('No navigation occurred during form fill');
    }
  }

  return { ok: true, details };
}

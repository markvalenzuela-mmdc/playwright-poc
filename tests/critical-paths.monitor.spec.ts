import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  FORM_CONTRACTS,
  PAGE_ELEMENT_CONTRACTS,
  PRIMARY_CTA_CONTRACTS,
  resolveLocator,
  type CriticalPathContract,
  type FormContract,
  type LocatorContract,
  type PageElementContract,
  type PrimaryCtaContract,
} from './monitoring.contracts';

const CRITICAL_PATH_CONTRACTS: CriticalPathContract[] = [
  { path: '/', expectedTitlePattern: /MMDC|Map[uú]a|Malayan/i },
  { path: '/certification-programs/' },
  { path: '/college-programs/' },
  { path: '/college-programs/ba-ai/' },
  { path: '/college-programs/marketing-management/' },
  { path: '/college-programs/operations-management/' },
  { path: '/college-programs/hr-management/' },
  { path: '/college-programs/it-ai/' },
  { path: '/college-programs/data-analytics/' },
  { path: '/college-programs/software-development/' },
  { path: '/college-programs/network-and-cybersecurity/' },
  { path: '/certification-programs/content-creator/' },
  { path: '/certification-programs/ai/' },
  { path: '/certification-programs/esl-instructor/' },
  { path: '/certification-programs/digital-marketing/' },
  { path: '/certification-programs/data-analytics/' },
  { path: '/certification-programs/ielts-preparation/' },
  { path: '/certification-programs/virtual-assistance/' },
  { path: '/admissions/' },
  { path: '/admissions/asenso/' },
  { path: '/admissions/abanse-negrense-scholarship/' },
  { path: '/admissions/city-scholarships/' },
  { path: '/admissions/continuing-education/' },
  { path: '/admissions/gadget-scholarship/' },
  { path: '/admissions/next-gen/' },
  { path: '/admissions/family-discount/' },
  { path: '/admissions/ygc-ayala-discount/' },
  { path: '/study-now-pay-later/' },
  { path: '/bukas/', expectedUrlPattern: /(mmdc\.mcl\.edu\.ph|bukas\.ph)/i },
  { path: '/admissions/financial-wellness-checker/' },
];

type CriticalPathRunResult = {
  path: string;
  status?: number;
  finalUrl?: string;
  title?: string;
  elementChecks: Array<{ locator: string; ok: boolean }>;
  ctaCheck?: { locator: string; ok: boolean; destination?: string; issue?: string };
  formCheck?: { ok: boolean; details: string[] };
  ok: boolean;
  issues: string[];
};

function locatorToString(contract: LocatorContract): string {
  if (contract.kind === 'css') return `css=${contract.selector}`;
  if (contract.kind === 'text') return `text=${String(contract.text)}`;
  return `role=${contract.role} name=${String(contract.name ?? '')}`.trim();
}

function findContractByPath<T extends { path: string }>(contracts: T[], path: string): T | undefined {
  return contracts.find((contract) => contract.path === path);
}

async function firstVisible(locator: Locator, maxChecks = 5): Promise<Locator | null> {
  const count = await locator.count();
  const checks = Math.min(count, maxChecks);
  for (let index = 0; index < checks; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function assertRequiredElements(page: Page, contract: PageElementContract, issues: string[]) {
  const elementChecks: Array<{ locator: string; ok: boolean }> = [];

  for (const locatorContract of contract.requiredLocators) {
    const locator = resolveLocator(page, locatorContract);
    const visible = await firstVisible(locator);
    const ok = visible !== null;
    elementChecks.push({ locator: locatorToString(locatorContract), ok });
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

  return elementChecks;
}

async function findFirstActionable(locator: Locator, page: Page, maxChecks = 12): Promise<Locator | null> {
  const count = await locator.count();
  const checks = Math.min(count, maxChecks);
  const header = page.locator('header').first();
  const headerBox = await header.boundingBox().catch(() => null);
  const headerBottom = headerBox ? headerBox.y + headerBox.height : 0;

  for (let index = 0; index < checks; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible().catch(() => false);
    if (!visible) continue;
    const targetMeta = await candidate
      .evaluate((el) => {
        const tag = el.tagName.toLowerCase();
        const href = el.getAttribute('href') ?? '';
        return { tag, href };
      })
      .catch(() => ({ tag: '', href: '' }));
    if (targetMeta.tag === 'a') {
      const href = targetMeta.href.trim().toLowerCase();
      if (
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:') ||
        href.startsWith('#')
      ) {
        continue;
      }
    }
    const inHeader = await candidate.evaluate((el) => !!el.closest('header, nav')).catch(() => false);
    if (inHeader) continue;
    const textLength = await candidate.innerText().then((v) => v.trim().length).catch(() => 0);
    if (textLength > 120) continue;

    await candidate.evaluate((el) => {
      (el as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' });
    });

    const box = await candidate.boundingBox();
    if (!box) continue;
    if (box.y <= headerBottom + 16) continue;

    try {
      await candidate.click({ trial: true, timeout: 1200 });
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

async function runCtaCheck(page: Page, contract: PrimaryCtaContract): Promise<{ ok: boolean; destination?: string; issue?: string }> {
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

async function runFormCheck(page: Page, contract: FormContract): Promise<{ ok: boolean; details: string[] }> {
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
      const requiredCount = await form
        .locator('input[required], select[required], textarea[required]')
        .count();
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

test.describe('Critical Path Monitoring', { tag: ['@core', '@crossbrowser'] }, () => {
  test('should enforce contract integrity', async ({ baseURL }) => {
    const base = baseURL ?? 'https://www.mmdc.mcl.edu.ph/';
    const monitoredOrigin = new URL(base).origin;

    const criticalPaths = CRITICAL_PATH_CONTRACTS.map((contract) => contract.path);
    const duplicates = criticalPaths.length - new Set(criticalPaths).size;
    expect(duplicates, 'Duplicate entries found in critical path contracts').toBe(0);

    for (const contract of CRITICAL_PATH_CONTRACTS) {
      expect(contract.path.startsWith('/'), `Critical path must be relative: ${contract.path}`).toBeTruthy();
      const resolved = new URL(contract.path, monitoredOrigin);
      expect(resolved.origin).toBe(monitoredOrigin);
    }

    const elementPaths = PAGE_ELEMENT_CONTRACTS.map((contract) => contract.path);
    const ctaPaths = PRIMARY_CTA_CONTRACTS.map((contract) => contract.path);

    for (const path of criticalPaths) {
      expect(elementPaths.includes(path), `Missing element contract for ${path}`).toBeTruthy();
      expect(ctaPaths.includes(path), `Missing primary CTA contract for ${path}`).toBeTruthy();
    }

    for (const path of elementPaths) {
      expect(criticalPaths.includes(path), `Element contract path not found in critical paths: ${path}`).toBeTruthy();
    }

    for (const path of ctaPaths) {
      expect(criticalPaths.includes(path), `CTA contract path not found in critical paths: ${path}`).toBeTruthy();
    }

    for (const formContract of FORM_CONTRACTS) {
      expect(criticalPaths.includes(formContract.path), `Form contract path not found in critical paths: ${formContract.path}`).toBeTruthy();
      expect(formContract.submitMode).toBe('no-submit');
    }
  });

  test('should keep all critical paths healthy for load, elements, ctas, and curated forms', async ({
    request,
    context,
    baseURL,
  }) => {
    test.setTimeout(12 * 60 * 1000);
    const base = baseURL ?? 'https://www.mmdc.mcl.edu.ph/';
    const monitoredOrigin = new URL(base).origin;

    const results: CriticalPathRunResult[] = [];
    const hardFailures: string[] = [];

    for (const pathContract of CRITICAL_PATH_CONTRACTS) {
      const path = pathContract.path;
      const result: CriticalPathRunResult = {
        path,
        elementChecks: [],
        ok: true,
        issues: [],
      };

    try {
        const pathPage = await context.newPage();
        try {
        const response = await request.get(path, { timeout: 30000 });
        result.status = response.status();
        if (response.status() >= 400) {
          result.ok = false;
          result.issues.push(`HTTP ${response.status()}`);
          hardFailures.push(`${path}: HTTP ${response.status()}`);
          results.push(result);
          continue;
        }

        await pathPage.goto(path, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await expect.soft(pathPage.locator('body')).toBeVisible();

        result.finalUrl = pathPage.url();
        const finalOrigin = new URL(result.finalUrl).origin;

        if (pathContract.expectedUrlPattern) {
          if (!pathContract.expectedUrlPattern.test(result.finalUrl)) {
            result.ok = false;
            result.issues.push(`Final URL mismatch for expected pattern ${String(pathContract.expectedUrlPattern)}`);
          }
        } else if (finalOrigin !== monitoredOrigin) {
          result.ok = false;
          result.issues.push(`Unexpected origin redirect (${finalOrigin})`);
        }

        result.title = (await pathPage.title()).trim();
        if (result.title.length === 0) {
          result.ok = false;
          result.issues.push('Empty title');
        }

        if (pathContract.expectedTitlePattern && !pathContract.expectedTitlePattern.test(result.title)) {
          result.ok = false;
          result.issues.push(`Title mismatch for expected pattern ${String(pathContract.expectedTitlePattern)}`);
        }

        const elementContract = findContractByPath(PAGE_ELEMENT_CONTRACTS, path);
        if (!elementContract) {
          result.ok = false;
          result.issues.push('Missing element contract');
        } else {
          result.elementChecks = await assertRequiredElements(pathPage, elementContract, result.issues);
        }

        const ctaContract = findContractByPath(PRIMARY_CTA_CONTRACTS, path);
        if (!ctaContract) {
          result.ok = false;
          result.issues.push('Missing CTA contract');
        } else {
          await pathPage.goto(path, { waitUntil: 'domcontentloaded', timeout: 45000 });
          const ctaResult = await runCtaCheck(pathPage, ctaContract);
          result.ctaCheck = {
            locator: locatorToString(ctaContract.locator),
            ...ctaResult,
          };

          if (!ctaResult.ok) {
            result.ok = false;
            result.issues.push(ctaResult.issue ?? 'CTA check failed');
          }
        }

        const formContract = findContractByPath(FORM_CONTRACTS, path);
        if (formContract) {
          await pathPage.goto(path, { waitUntil: 'domcontentloaded', timeout: 45000 });
          const formResult = await runFormCheck(pathPage, formContract);
          result.formCheck = formResult;
          if (!formResult.ok) {
            result.ok = false;
            result.issues.push(...formResult.details);
          }
        }

        } finally {
          await pathPage.close().catch(() => {});
        }
      } catch (error) {
        result.ok = false;
        result.issues.push(`Runtime failure: ${String(error)}`);
      }

      if (!result.ok) {
        hardFailures.push(`${path}: ${result.issues.join(' | ')}`);
      }

      results.push(result);
    }

    await test.info().attach('critical-path-monitoring-results', {
      body: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          monitoredBaseUrl: base,
          pathCount: CRITICAL_PATH_CONTRACTS.length,
          resultCount: results.length,
          results,
        },
        null,
        2
      ),
      contentType: 'application/json',
    });

    expect(hardFailures, `Critical monitoring failures:\n${hardFailures.join('\n')}`).toEqual([]);
  });
});

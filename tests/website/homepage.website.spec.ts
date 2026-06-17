import { expect, test } from '@playwright/test';
import { CRITICAL_PATH_CONTRACTS, PAGE_ELEMENT_CONTRACTS, PRIMARY_CTA_CONTRACTS } from './contracts';
import { requireContractByPath } from './support/locators';
import { checkLoadedPage, checkRequiredElements, runCtaCheck } from './support/page-checks';
import { getWebsiteOrigin } from './support/website-runner';

const HOME_PATH = '/';

const homepageContract = () => requireContractByPath(CRITICAL_PATH_CONTRACTS, HOME_PATH, 'critical path');
const homepageElements = () => requireContractByPath(PAGE_ELEMENT_CONTRACTS, HOME_PATH, 'page element');
const homepageCta = () => requireContractByPath(PRIMARY_CTA_CONTRACTS, HOME_PATH, 'primary CTA');

test.describe('Homepage Website Smoke', { tag: ['@core', '@crossbrowser', '@smoke'] }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(HOME_PATH, { waitUntil: 'domcontentloaded' });
  });

  test('should load homepage and keep a usable title', async ({ page, baseURL }) => {
    await expect(page.locator('body')).toBeVisible();

    const pageLoad = await checkLoadedPage(page, homepageContract(), getWebsiteOrigin(baseURL));
    expect(pageLoad.issues, `Homepage load issues:\n${pageLoad.issues.join('\n')}`).toEqual([]);
    expect(pageLoad.title.length).toBeGreaterThan(5);
  });

  test('should expose key institution markers', async ({ page }) => {
    const elementResult = await checkRequiredElements(page, homepageElements());
    expect(elementResult.issues, `Homepage marker issues:\n${elementResult.issues.join('\n')}`).toEqual([]);
  });

  test('should reach a primary CTA destination', async ({ page }) => {
    const ctaResult = await runCtaCheck(page, homepageCta());
    expect(ctaResult.ok, ctaResult.issue).toBeTruthy();
    expect(ctaResult.destination).not.toContain('about:blank');
  });
});

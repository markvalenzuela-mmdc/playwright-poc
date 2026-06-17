import { expect, test } from '@playwright/test';
import {
  CRITICAL_PATH_CONTRACTS,
  FORM_CONTRACTS,
  PAGE_ELEMENT_CONTRACTS,
  PRIMARY_CTA_CONTRACTS,
} from './contracts';
import {
  assertWebsiteContractIntegrity,
  attachCriticalPathResults,
  getWebsiteBaseUrl,
  getWebsiteOrigin,
  runCriticalPathCheck,
  type CriticalPathRunResult,
} from './support/website-runner';

test.describe('Website Critical Paths', { tag: ['@core', '@crossbrowser'] }, () => {
  test('should enforce contract integrity', async ({ baseURL }) => {
    assertWebsiteContractIntegrity({
      baseURL,
      criticalPathContracts: CRITICAL_PATH_CONTRACTS,
      pageElementContracts: PAGE_ELEMENT_CONTRACTS,
      primaryCtaContracts: PRIMARY_CTA_CONTRACTS,
      formContracts: FORM_CONTRACTS,
    });
  });

  test('should keep all critical paths healthy for load, elements, ctas, and curated forms', async ({
    request,
    context,
    baseURL,
  }, testInfo) => {
    test.setTimeout(12 * 60 * 1000);
    const base = getWebsiteBaseUrl(baseURL);
    const websiteOrigin = getWebsiteOrigin(base);

    const results: CriticalPathRunResult[] = [];
    for (const pathContract of CRITICAL_PATH_CONTRACTS) {
      results.push(await runCriticalPathCheck({ request, context, websiteOrigin, pathContract }));
    }
    const hardFailures = results
      .filter((result) => !result.ok)
      .map((result) => `${result.path}: ${result.issues.join(' | ')}`);

    await attachCriticalPathResults(testInfo, {
      baseUrl: base,
      pathCount: CRITICAL_PATH_CONTRACTS.length,
      results,
    });

    expect(hardFailures, `Website critical path failures:\n${hardFailures.join('\n')}`).toEqual([]);
  });
});

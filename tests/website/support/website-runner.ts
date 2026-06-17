import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test';
import {
  FORM_CONTRACTS,
  PAGE_ELEMENT_CONTRACTS,
  PRIMARY_CTA_CONTRACTS,
  type CriticalPathContract,
  type FormContract,
  type PageElementContract,
  type PrimaryCtaContract,
} from '../contracts';
import { checkLoadedPage, checkRequiredElements, runCtaCheck, runFormCheck, type ElementCheck } from './page-checks';
import { findContractByPath, locatorToString } from './locators';

const DEFAULT_WEBSITE_BASE_URL = 'https://www.mmdc.mcl.edu.ph/';

export type CriticalPathRunResult = {
  path: string;
  status?: number;
  finalUrl?: string;
  title?: string;
  elementChecks: ElementCheck[];
  ctaCheck?: { locator: string; ok: boolean; destination?: string; issue?: string };
  formCheck?: { ok: boolean; details: string[] };
  ok: boolean;
  issues: string[];
};

export function getWebsiteBaseUrl(baseURL?: string): string {
  return baseURL ?? DEFAULT_WEBSITE_BASE_URL;
}

export function getWebsiteOrigin(baseURL?: string): string {
  return new URL(getWebsiteBaseUrl(baseURL)).origin;
}

type ContractIntegrityOptions = {
  baseURL?: string;
  criticalPathContracts: CriticalPathContract[];
  pageElementContracts: PageElementContract[];
  primaryCtaContracts: PrimaryCtaContract[];
  formContracts: FormContract[];
};

export function assertWebsiteContractIntegrity({
  baseURL,
  criticalPathContracts,
  pageElementContracts,
  primaryCtaContracts,
  formContracts,
}: ContractIntegrityOptions) {
  const websiteOrigin = getWebsiteOrigin(baseURL);
  const criticalPaths = criticalPathContracts.map((contract) => contract.path);
  const duplicates = criticalPaths.length - new Set(criticalPaths).size;
  expect(duplicates, 'Duplicate entries found in critical path contracts').toBe(0);

  for (const contract of criticalPathContracts) {
    expect(contract.path.startsWith('/'), `Critical path must be relative: ${contract.path}`).toBeTruthy();
    const resolved = new URL(contract.path, websiteOrigin);
    expect(resolved.origin).toBe(websiteOrigin);
  }

  const elementPaths = pageElementContracts.map((contract) => contract.path);
  const ctaPaths = primaryCtaContracts.map((contract) => contract.path);

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

  for (const formContract of formContracts) {
    expect(criticalPaths.includes(formContract.path), `Form contract path not found in critical paths: ${formContract.path}`).toBeTruthy();
    expect(formContract.submitMode).toBe('no-submit');
  }
}

type CriticalPathCheckOptions = {
  request: APIRequestContext;
  context: BrowserContext;
  websiteOrigin: string;
  pathContract: CriticalPathContract;
  pageElementContracts?: PageElementContract[];
  primaryCtaContracts?: PrimaryCtaContract[];
  formContracts?: FormContract[];
};

export async function runCriticalPathCheck({
  request,
  context,
  websiteOrigin,
  pathContract,
  pageElementContracts = PAGE_ELEMENT_CONTRACTS,
  primaryCtaContracts = PRIMARY_CTA_CONTRACTS,
  formContracts = FORM_CONTRACTS,
}: CriticalPathCheckOptions): Promise<CriticalPathRunResult> {
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
        return result;
      }

      await pathPage.goto(path, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await expect.soft(pathPage.locator('body')).toBeVisible();

      const pageLoad = await checkLoadedPage(pathPage, pathContract, websiteOrigin);
      result.finalUrl = pageLoad.finalUrl;
      result.title = pageLoad.title;
      result.issues.push(...pageLoad.issues);

      const elementContract = findContractByPath(pageElementContracts, path);
      if (!elementContract) {
        result.issues.push('Missing element contract');
      } else {
        const elementResult = await checkRequiredElements(pathPage, elementContract);
        result.elementChecks = elementResult.checks;
        result.issues.push(...elementResult.issues);
      }

      const ctaContract = findContractByPath(primaryCtaContracts, path);
      if (!ctaContract) {
        result.issues.push('Missing CTA contract');
      } else {
        await pathPage.goto(path, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ctaResult = await runCtaCheck(pathPage, ctaContract);
        result.ctaCheck = {
          locator: locatorToString(ctaContract.locator),
          ...ctaResult,
        };

        if (!ctaResult.ok) {
          result.issues.push(ctaResult.issue ?? 'CTA check failed');
        }
      }

      const formContract = findContractByPath(formContracts, path);
      if (formContract) {
        await pathPage.goto(path, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const formResult = await runFormCheck(pathPage, formContract);
        result.formCheck = formResult;
        if (!formResult.ok) {
          result.issues.push(...formResult.details);
        }
      }
    } finally {
      await pathPage.close().catch(() => {});
    }
  } catch (error) {
    result.issues.push(`Runtime failure: ${String(error)}`);
  }

  result.ok = result.issues.length === 0;
  return result;
}

export async function attachCriticalPathResults(
  testInfo: TestInfo,
  options: { baseUrl: string; pathCount: number; results: CriticalPathRunResult[] }
) {
  await testInfo.attach('website-critical-path-results', {
    body: JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        websiteBaseUrl: options.baseUrl,
        pathCount: options.pathCount,
        resultCount: options.results.length,
        results: options.results,
      },
      null,
      2
    ),
    contentType: 'application/json',
  });
}

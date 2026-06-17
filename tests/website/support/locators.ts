import type { Locator, Page } from '@playwright/test';
import type { LocatorContract } from '../contracts';

export function resolveLocator(page: Page | Locator, contract: LocatorContract): Locator {
  if (contract.kind === 'css') {
    return page.locator(contract.selector);
  }

  if (contract.kind === 'text') {
    return page.getByText(contract.text, { exact: contract.exact });
  }

  return page.getByRole(contract.role, {
    name: contract.name,
    exact: contract.exact,
  });
}

export function locatorToString(contract: LocatorContract): string {
  if (contract.kind === 'css') return `css=${contract.selector}`;
  if (contract.kind === 'text') return `text=${String(contract.text)}`;
  return `role=${contract.role} name=${String(contract.name ?? '')}`.trim();
}

export function findContractByPath<T extends { path: string }>(contracts: T[], path: string): T | undefined {
  return contracts.find((contract) => contract.path === path);
}

export function requireContractByPath<T extends { path: string }>(contracts: T[], path: string, contractName: string): T {
  const contract = findContractByPath(contracts, path);
  if (!contract) throw new Error(`Missing ${contractName} contract for ${path}`);
  return contract;
}

export async function firstVisible(locator: Locator, maxChecks = 5): Promise<Locator | null> {
  const count = await locator.count();
  const checks = Math.min(count, maxChecks);
  for (let index = 0; index < checks; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

export async function findFirstActionable(locator: Locator, page: Page, maxChecks = 12): Promise<Locator | null> {
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

    const textLength = await candidate
      .innerText()
      .then((value) => value.trim().length)
      .catch(() => 0);
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

import { expect, test, type Locator, type Page } from '@playwright/test';

const CTA_PATTERNS = [/Apply/i, /Enroll/i, /Admissions?/i, /Programs?/i, /Find your path/i, /Pathfinder/i];

async function findFirstVisibleCtaTarget(page: Page): Promise<Locator | null> {
  for (const pattern of CTA_PATTERNS) {
    const link = page.getByRole('link', { name: pattern }).first();
    if ((await link.count()) > 0 && (await link.isVisible())) {
      const href = ((await link.getAttribute('href')) ?? '').trim().toLowerCase();
      if (
        !href.startsWith('mailto:') &&
        !href.startsWith('tel:') &&
        !href.startsWith('javascript:') &&
        !href.startsWith('#')
      ) {
        return link;
      }
    }

    const button = page.getByRole('button', { name: pattern }).first();
    if ((await button.count()) > 0 && (await button.isVisible())) return button;
  }

  return null;
}

test.describe('Homepage Smoke Monitoring', { tag: ['@core', '@crossbrowser', '@smoke'] }, () => {
  test('should load homepage and keep a usable title', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/mmdc\.mcl\.edu\.ph/i);
    await expect(page.locator('body')).toBeVisible();

    const title = (await page.title()).trim();
    expect(title.length).toBeGreaterThan(5);
  });

  test('should expose key institution markers', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const markerCandidates = [
      page.getByRole('heading', { name: /MMDC|Map[uú]a|Malayan/i }).first(),
      page.getByRole('link', { name: /Admissions?|Programs?|About/i }).first(),
      page.getByText(/Discover In-Demand, Fully Online Programs/i).first(),
      page.locator('img[alt*="MMDC" i], img[alt*="Mapua" i], img[alt*="Mapúa" i]').first(),
    ];

    let markerFound = false;
    for (const marker of markerCandidates) {
      if ((await marker.count()) > 0 && (await marker.isVisible())) {
        markerFound = true;
        break;
      }
    }

    expect(markerFound).toBeTruthy();
  });

  test('should reach a primary CTA destination', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const cta = await findFirstVisibleCtaTarget(page);
    expect(cta).not.toBeNull();
    if (!cta) return;

    const beforeUrl = page.url();
    const popupPromise = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);

    await cta.click({ timeout: 15000 });

    const popup = await popupPromise;
    const activePage = popup ?? page;

    await activePage.waitForLoadState('domcontentloaded', { timeout: 15000 });
    const afterUrl = activePage.url();

    expect(afterUrl.length).toBeGreaterThan(0);
    expect(afterUrl).not.toContain('about:blank');

    if (afterUrl === beforeUrl) {
      await expect(activePage.locator('main, h1, h2').first()).toBeVisible();
    }
  });
});

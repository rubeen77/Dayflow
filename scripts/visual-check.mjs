import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

await mkdir('test-results/visual', { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, width, height] of [
    ['desktop', 1440, 1100],
    ['iphone', 390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
    });
    await page.goto('http://localhost:4173');
    await page.getByRole('heading', { name: /Buenos días|Buenas tardes|Buenas noches/ }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `test-results/visual/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.close();
  }
} finally {
  await browser.close();
}

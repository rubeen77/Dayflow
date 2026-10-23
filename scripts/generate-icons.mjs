import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const browser = await chromium.launch();
try {
  const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, size, maskable] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['apple-touch-icon.png', 180, false],
    ['icon-maskable.png', 512, true],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>*{margin:0}body{background:#101014;display:grid;place-items:center;width:100vw;height:100vh}svg{width:${maskable ? '78%' : '100%'};height:auto}</style>${svg}`,
    );
    await page.screenshot({
      path: new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'),
    });
  }
} finally {
  await browser.close();
}

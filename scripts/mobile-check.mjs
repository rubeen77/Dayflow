import { webkit } from '@playwright/test';
const browser = await webkit.launch();
const errors = [];
try {
  for (const width of [320, 375, 390, 430]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'es-ES',
      timezoneId: 'Europe/Madrid',
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    for (const view of [
      'today',
      'calendar',
      'tasks',
      'planner',
      'habits',
      'focus',
      'stats',
      'settings',
    ]) {
      await page.goto(`http://localhost:4173/#${view}`);
      await page.locator('h1').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const sizes = await page.evaluate(() => ({
        screen: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      if (sizes.content > sizes.screen + 1)
        throw new Error(
          `${width}px / ${view}: desbordamiento ${sizes.content}px > ${sizes.screen}px`,
        );
      if (view === 'calendar') {
        await page.getByRole('button', { name: 'Semana', exact: true }).click();
        if ((await page.locator('.calendar-week-mobile').isVisible()) === false)
          throw new Error('No se mostró la semana móvil');
      }
    }
    console.log(`WebKit ${width}px: 8 pantallas sin desbordamiento horizontal`);
    await context.close();
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}

const { chromium } = require('playwright');
const fs = require('fs/promises');

const pages = [
  { name: 'home', url: 'https://hayfam.co.uk/' },
  { name: 'books', url: 'https://hayfam.co.uk/books/' }
];

const viewports = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'mobile', width: 412, height: 915, mobile: true }
];

async function capture() {
  await fs.mkdir('screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
        userAgent: viewport.mobile
          ? 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'
          : undefined
      });

      for (const target of pages) {
        const page = await context.newPage();
        const separator = target.url.includes('?') ? '&' : '?';
        const url = `${target.url}${separator}visual-check=${Date.now()}`;

        console.log(`Capturing ${target.name} at ${viewport.name}: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(5000);
        await page.evaluate(async () => {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
        });
        await page.waitForTimeout(1500);

        await page.screenshot({
          path: `screenshots/${target.name}-${viewport.name}-top.png`,
          fullPage: false
        });

        await page.screenshot({
          path: `screenshots/${target.name}-${viewport.name}-full.png`,
          fullPage: true
        });

        await page.close();
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

capture().catch((error) => {
  console.error(error);
  process.exit(1);
});

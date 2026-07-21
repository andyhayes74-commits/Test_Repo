const { chromium } = require('playwright');
const fs = require('fs/promises');

const products = [
  { name: 'The War Tax', url: 'https://amzn.eu/d/06BRn0He' },
  { name: 'The Better World Protocol', url: 'https://amzn.eu/d/0aRNtQsD' },
  { name: 'The Backup Protocol', url: 'https://amzn.eu/d/00ukRqTf' }
];

(async () => {
  await fs.rm('screenshots', { recursive: true, force: true });
  await fs.mkdir('screenshots', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36'
  });
  const results = [];
  for (const product of products) {
    const page = await context.newPage();
    try {
      await page.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);
      results.push({ name: product.name, shortUrl: product.url, finalUrl: page.url(), title: await page.title() });
    } catch (error) {
      results.push({ name: product.name, shortUrl: product.url, finalUrl: page.url(), error: error.message });
    } finally {
      await page.close();
    }
  }
  await fs.writeFile('screenshots/amazon-links.json', JSON.stringify(results, null, 2));
  await browser.close();
})().catch(async error => {
  await fs.mkdir('screenshots', { recursive: true });
  await fs.writeFile('screenshots/amazon-links.json', JSON.stringify([{ fatalError: error.message }], null, 2));
  process.exitCode = 0;
});

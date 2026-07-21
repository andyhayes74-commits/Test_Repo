// Audit rebuilt Hayfam Books website, 21 July 2026
const { chromium } = require('playwright');
const fs = require('fs/promises');

const pages = [
  { name: 'home', url: 'https://hayfam.co.uk/' },
  { name: 'books', url: 'https://hayfam.co.uk/books/' },
  { name: 'society', url: 'https://hayfam.co.uk/the-society-of-temporal-studies/' },
  { name: 'better-world', url: 'https://hayfam.co.uk/the-better-world-series/' },
  { name: 'about', url: 'https://hayfam.co.uk/about-hayfam-books/' },
  { name: 'readers', url: 'https://hayfam.co.uk/join-the-readers-list/' },
  { name: 'signup', url: 'https://hayfam.co.uk/signup/' },
  { name: 'contact', url: 'https://hayfam.co.uk/contact-hayfam-books/' },
  { name: 'privacy', url: 'https://hayfam.co.uk/privacy-notice/' }
];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'mobile', width: 412, height: 915, mobile: true }
];
async function loadWholePage(page) {
  await page.evaluate(async () => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    document.documentElement.style.scrollBehavior = 'auto';
    const step = Math.max(320, Math.floor(innerHeight * .72));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y); await delay(100);
    }
    window.scrollTo(0, document.documentElement.scrollHeight); await delay(500);
    window.scrollTo(0, 0); await delay(500);
  });
}
async function capture() {
  await fs.rm('screenshots', { recursive: true, force: true });
  await fs.mkdir('screenshots', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const audit = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        isMobile: viewport.mobile,
        hasTouch: viewport.mobile,
        userAgent: viewport.mobile ? 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36' : undefined
      });
      for (const target of pages) {
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
        page.on('pageerror', e => consoleErrors.push(e.message));
        await page.goto(`${target.url}?rebuild-audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(4000);
        await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
        await loadWholePage(page);
        const pageAudit = await page.evaluate(() => {
          const visible = el => {
            const s = getComputedStyle(el), r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          };
          const overflowing = [...document.querySelectorAll('body *')].filter(visible).map(el => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), className: typeof el.className === 'string' ? el.className : '', left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
          }).filter(x => x.left < -2 || x.right > innerWidth + 2).slice(0, 25);
          const missingImages = [...document.images].filter(img => !img.complete || img.naturalWidth === 0).map(img => ({ src: img.currentSrc || img.src, alt: img.alt }));
          const h1 = document.querySelector('h1');
          const primaryActions = [...document.querySelectorAll('.hb-button')].filter(visible).slice(0, 8).map(a => a.textContent.trim());
          return {
            document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
            h1Count: document.querySelectorAll('h1').length,
            headingFont: h1 ? getComputedStyle(h1).fontFamily : null,
            missingImages,
            overflowing,
            primaryActions
          };
        });
        audit.push({ page: target.name, viewportName: viewport.name, consoleErrors, ...pageAudit });
        await page.screenshot({ path: `screenshots/${target.name}-${viewport.name}-top.png`, fullPage: false });
        await page.screenshot({ path: `screenshots/${target.name}-${viewport.name}-full.png`, fullPage: true });
        await page.close();
      }
      await context.close();
    }
  } finally {
    await fs.writeFile('screenshots/site-audit.json', JSON.stringify(audit, null, 2));
    await browser.close();
  }
}
capture().catch(error => { console.error(error); process.exit(1); });

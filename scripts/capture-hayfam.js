// Verification pass including the social signup landing page
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
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    document.documentElement.style.scrollBehavior = 'auto';
    const step = Math.max(320, Math.floor(innerHeight * 0.72));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await delay(90);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await delay(400);
    window.scrollTo(0, 0);
    await delay(500);
  });
}

async function capture() {
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
        userAgent: viewport.mobile
          ? 'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36'
          : undefined
      });

      for (const target of pages) {
        const page = await context.newPage();
        const consoleErrors = [];
        page.on('console', (message) => {
          if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => consoleErrors.push(error.message));

        const separator = target.url.includes('?') ? '&' : '?';
        const url = `${target.url}${separator}visual-check=${Date.now()}`;
        console.log(`Capturing ${target.name} at ${viewport.name}: ${url}`);

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(4500);
        await page.evaluate(async () => {
          if (document.fonts && document.fonts.ready) await document.fonts.ready;
        });
        await loadWholePage(page);

        const pageAudit = await page.evaluate(() => {
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          };

          const overflowing = Array.from(document.querySelectorAll('body *'))
            .filter(visible)
            .map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                className: typeof element.className === 'string' ? element.className : '',
                left: Math.round(rect.left),
                right: Math.round(rect.right),
                width: Math.round(rect.width)
              };
            })
            .filter((item) => item.left < -2 || item.right > innerWidth + 2)
            .slice(0, 20);

          const missingImages = Array.from(document.images)
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .map((image) => ({ src: image.currentSrc || image.src, alt: image.alt }));

          return {
            title: document.title,
            url: location.href,
            statusText: document.body.innerText.trim().slice(0, 120),
            viewport: { width: innerWidth, height: innerHeight },
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              scrollHeight: document.documentElement.scrollHeight
            },
            h1Count: document.querySelectorAll('h1').length,
            navCount: document.querySelectorAll('nav').length,
            missingImages,
            overflowing
          };
        });

        audit.push({
          page: target.name,
          viewport: viewport.name,
          consoleErrors,
          ...pageAudit
        });

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
    await fs.writeFile('screenshots/site-audit.json', JSON.stringify(audit, null, 2));
    await browser.close();
  }
}

capture().catch((error) => {
  console.error(error);
  process.exit(1);
});

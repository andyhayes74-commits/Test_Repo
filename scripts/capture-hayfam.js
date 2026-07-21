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
      window.scrollTo(0, y);
      await delay(90);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await delay(400);
    window.scrollTo(0, 0);
    await delay(500);
  });
}

function normaliseUrl(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

async function checkLink(request, href) {
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return { skipped: true };
  try {
    const res = await request.get(href, { timeout: 25000, maxRedirects: 10, failOnStatusCode: false });
    return { status: res.status(), finalUrl: res.url(), ok: res.ok() };
  } catch (error) {
    return { status: null, ok: false, error: error.message };
  }
}

async function capture() {
  await fs.rm('screenshots', { recursive: true, force: true });
  await fs.mkdir('screenshots', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const audit = [];
  const uniqueLinks = new Map();
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
        await page.goto(`${target.url}?production-audit=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForTimeout(3500);
        await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
        await loadWholePage(page);
        const result = await page.evaluate(() => {
          const visible = el => {
            const s = getComputedStyle(el), r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) > 0 && r.width > 0 && r.height > 0;
          };
          const structural = 'main,header,footer,section,nav,article,aside,div';
          const links = [...document.querySelectorAll('a[href]')].map(a => {
            const r = a.getBoundingClientRect();
            return {
              text: a.textContent.replace(/\s+/g, ' ').trim(),
              href: a.href,
              rawHref: a.getAttribute('href'),
              visible: visible(a),
              aboveFold: visible(a) && r.top >= 0 && r.top < innerHeight,
              inNav: !!a.closest('nav'),
              inFooter: !!a.closest('footer'),
              target: a.target || null,
              ariaLabel: a.getAttribute('aria-label')
            };
          });
          const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ level: Number(h.tagName[1]), text: h.textContent.replace(/\s+/g, ' ').trim(), visible: visible(h) }));
          const overflow = [...document.querySelectorAll('body *')].filter(visible).map(el => {
            const r = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), className: typeof el.className === 'string' ? el.className : '', left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
          }).filter(x => x.left < -2 || x.right > innerWidth + 2).slice(0, 25);
          const emptyParagraphs = [...document.querySelectorAll('p')].filter(p => !p.textContent.trim() && !p.querySelector('img,iframe,input,button')).length;
          const strayBreaks = [...document.querySelectorAll('br')].filter(br => {
            const parent = br.parentElement;
            return parent && (parent.matches(structural) || br.previousElementSibling?.matches(structural) || br.nextElementSibling?.matches(structural));
          }).length;
          const hiddenThemeNodes = [...document.querySelectorAll('#masthead,#colophon,.site-header,.site-footer')].map(el => ({ tag: el.tagName.toLowerCase(), id: el.id, className: typeof el.className === 'string' ? el.className : '', visible: visible(el), ariaHidden: el.getAttribute('aria-hidden'), linkCount: el.querySelectorAll('a').length }));
          const ctas = links.filter(l => /pre-order|preorder|buy on amazon|join newsletter|join the newsletter|join arc|arc team|read an excerpt|sample chapter/i.test(l.text));
          const missingAlt = [...document.images].filter(img => !img.hasAttribute('alt')).map(img => img.currentSrc || img.src);
          const emptyAlt = [...document.images].filter(img => img.getAttribute('alt') === '' && !img.closest('[aria-hidden="true"]')).map(img => img.currentSrc || img.src);
          const main = document.querySelector('main');
          return {
            url: location.href,
            title: document.title,
            htmlLang: document.documentElement.lang,
            metaDescription: document.querySelector('meta[name="description"]')?.content || null,
            canonical: document.querySelector('link[rel="canonical"]')?.href || null,
            og: {
              title: document.querySelector('meta[property="og:title"]')?.content || null,
              description: document.querySelector('meta[property="og:description"]')?.content || null,
              image: document.querySelector('meta[property="og:image"]')?.content || null,
              type: document.querySelector('meta[property="og:type"]')?.content || null
            },
            mainCount: document.querySelectorAll('main').length,
            nestedMainCount: document.querySelectorAll('main main').length,
            bodyMainDirect: main ? main.parentElement === document.body : false,
            headerCount: document.querySelectorAll('header').length,
            footerCount: document.querySelectorAll('footer').length,
            navCount: document.querySelectorAll('nav').length,
            h1Count: document.querySelectorAll('h1').length,
            headings,
            links,
            ctas,
            emptyParagraphs,
            strayBreaks,
            hiddenThemeNodes,
            missingAlt,
            emptyAlt,
            forms: [...document.querySelectorAll('form')].map(f => ({ id: f.id, action: f.action, ariaLabel: f.getAttribute('aria-label'), visible: visible(f) })),
            ids: [...document.querySelectorAll('[id]')].map(el => el.id),
            overflow,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            consoleErrors
          };
        });
        audit.push({ page: target.name, viewport: viewport.name, ...result });
        for (const link of result.links) {
          const href = normaliseUrl(link.href, target.url).split('#')[0];
          if (href && !uniqueLinks.has(href)) uniqueLinks.set(href, { href, texts: new Set(), pages: new Set() });
          if (href) {
            uniqueLinks.get(href).texts.add(link.text);
            uniqueLinks.get(href).pages.add(target.name);
          }
        }
        await page.screenshot({ path: `screenshots/${target.name}-${viewport.name}-top.png`, fullPage: false });
        await page.screenshot({ path: `screenshots/${target.name}-${viewport.name}-full.png`, fullPage: true });
        await page.close();
      }
      await context.close();
    }

    const requestContext = await browser.newContext();
    const linkResults = [];
    for (const item of uniqueLinks.values()) {
      const check = await checkLink(requestContext.request, item.href);
      linkResults.push({ href: item.href, texts: [...item.texts], pages: [...item.pages], ...check });
    }
    await requestContext.close();
    await fs.writeFile('screenshots/site-audit.json', JSON.stringify({ pages: audit, links: linkResults }, null, 2));
  } finally {
    await browser.close();
  }
}

capture().catch(error => { console.error(error); process.exit(1); });

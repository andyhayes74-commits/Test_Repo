const { chromium } = require('playwright');
const fs = require('fs/promises');

const pages = [
  ['home','https://hayfam.co.uk/'],
  ['books','https://hayfam.co.uk/books/'],
  ['society','https://hayfam.co.uk/the-society-of-temporal-studies/'],
  ['better-world','https://hayfam.co.uk/the-better-world-series/'],
  ['about','https://hayfam.co.uk/about-hayfam-books/'],
  ['readers','https://hayfam.co.uk/join-the-readers-list/'],
  ['signup','https://hayfam.co.uk/signup/'],
  ['contact','https://hayfam.co.uk/contact-hayfam-books/'],
  ['privacy','https://hayfam.co.uk/privacy-notice/']
];
const viewports = [
  { name:'desktop', width:1440, height:1000, mobile:false },
  { name:'mobile', width:412, height:915, mobile:true }
];

async function loadWholePage(page) {
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y=0; y<document.documentElement.scrollHeight; y += Math.max(320, innerHeight*.7)) {
      scrollTo(0,y); await wait(80);
    }
    scrollTo(0,document.documentElement.scrollHeight); await wait(350);
    scrollTo(0,0); await wait(450);
  });
}

(async () => {
  await fs.rm('screenshots',{recursive:true,force:true});
  await fs.mkdir('screenshots',{recursive:true});
  const browser = await chromium.launch({headless:true});
  const results=[];
  const internalLinks=new Set();
  for (const vp of viewports) {
    const context=await browser.newContext({
      viewport:{width:vp.width,height:vp.height}, isMobile:vp.mobile, hasTouch:vp.mobile,
      userAgent:vp.mobile?'Mozilla/5.0 (Linux; Android 16; Mobile) AppleWebKit/537.36 Chrome/138.0.0.0 Mobile Safari/537.36':undefined
    });
    for (const [name,url] of pages) {
      const page=await context.newPage();
      const consoleErrors=[];
      page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
      page.on('pageerror',e=>consoleErrors.push(e.message));
      try {
        await page.goto(`${url}?final-audit=${Date.now()}`,{waitUntil:'domcontentloaded',timeout:90000});
        await page.waitForTimeout(3500);
        await page.evaluate(async()=>{if(document.fonts?.ready)await document.fonts.ready});
        await loadWholePage(page);
        const audit=await page.evaluate(() => {
          const visible=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity!==0&&r.width>0&&r.height>0};
          const links=[...document.querySelectorAll('a[href]')].map(a=>({
            text:a.textContent.replace(/\s+/g,' ').trim(), href:a.href, rawHref:a.getAttribute('href'), visible:visible(a),
            aboveFold:visible(a)&&a.getBoundingClientRect().top>=0&&a.getBoundingClientRect().top<innerHeight,
            inNav:!!a.closest('nav'), inFooter:!!a.closest('footer')
          }));
          const hiddenThemeNodes=[...document.querySelectorAll('#masthead,#colophon,.site-header,.site-footer')].map(el=>({
            id:el.id, className:typeof el.className==='string'?el.className:'', visible:visible(el), ariaHidden:el.getAttribute('aria-hidden'),
            links:[...el.querySelectorAll('a[href]')].map(a=>({
              text:a.textContent.replace(/\s+/g,' ').trim(), href:a.href,
              itemId:a.closest('li')?.id||null, itemClass:a.closest('li')?.className||null
            }))
          }));
          const overflow=[...document.querySelectorAll('body *')].filter(visible).map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName.toLowerCase(),className:typeof el.className==='string'?el.className:'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}}).filter(x=>x.left<-2||x.right>innerWidth+2).slice(0,20);
          const ctas=links.filter(x=>/pre-order|preorder|buy on amazon|join newsletter|join the newsletter|join arc|arc team|explore the story/i.test(x.text));
          return {
            title:document.title, htmlLang:document.documentElement.lang,
            metaDescription:document.querySelector('meta[name="description"]')?.content||null,
            canonical:document.querySelector('link[rel="canonical"]')?.href||null,
            ogImage:document.querySelector('meta[property="og:image"]')?.content||null,
            mainCount:document.querySelectorAll('main').length, nestedMainCount:document.querySelectorAll('main main').length,
            h1Count:document.querySelectorAll('h1').length,
            headings:[...document.querySelectorAll('h1,h2,h3')].map(h=>({tag:h.tagName,text:h.textContent.replace(/\s+/g,' ').trim(),visible:visible(h)})),
            emptyParagraphs:[...document.querySelectorAll('p')].filter(p=>!p.textContent.trim()&&!p.querySelector('img,iframe,input,button')).length,
            strayBreaks:[...document.querySelectorAll('br')].filter(br=>{const p=br.parentElement,pr=br.previousElementSibling,n=br.nextElementSibling;return p&&(p.matches('main,header,footer,section,nav,article,aside,div')||pr?.matches('main,header,footer,section,nav,article,aside,div')||n?.matches('main,header,footer,section,nav,article,aside,div'))}).length,
            hiddenThemeNodes, links, ctas,
            missingImages:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src),
            forms:[...document.querySelectorAll('form')].map(f=>({id:f.id,visible:visible(f),action:f.action})),
            overflow, scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth
          };
        });
        for(const link of audit.links){try{const u=new URL(link.href);if(u.hostname==='hayfam.co.uk')internalLinks.add(u.origin+u.pathname)}catch{}}
        results.push({page:name,viewport:vp.name,consoleErrors,...audit});
        await page.screenshot({path:`screenshots/${name}-${vp.name}-top.png`,fullPage:false});
        await page.screenshot({path:`screenshots/${name}-${vp.name}-full.png`,fullPage:true});
      } catch(error) { results.push({page:name,viewport:vp.name,fatalError:error.message,consoleErrors}); }
      await page.close();
    }
    await context.close();
  }
  const request=await browser.newContext();
  const linkChecks=[];
  for(const url of internalLinks){try{const r=await request.request.get(url,{timeout:30000,failOnStatusCode:false});linkChecks.push({url,status:r.status(),finalUrl:r.url(),ok:r.ok()})}catch(error){linkChecks.push({url,status:null,ok:false,error:error.message})}}
  await request.close();
  await fs.writeFile('screenshots/site-audit.json',JSON.stringify({pages:results,internalLinkChecks:linkChecks},null,2));
  await browser.close();
})().catch(async error=>{await fs.mkdir('screenshots',{recursive:true});await fs.writeFile('screenshots/runner-error.txt',error.stack||error.message);process.exitCode=0});

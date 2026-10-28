// uso: node .claude/arena-clips.mjs <hash> <prefixo> [porta] [m|d]
import { chromium } from 'playwright';
const [hash, out, port = '5192', size = 'm'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'msedge' });
const ctx = await b.newContext({ viewport: size === 'm' ? { width: 375, height: 812 } : { width: 1280, height: 800 }, hasTouch: size === 'm' });
const p = await ctx.newPage();
await p.goto(`http://localhost:${port}/pokemon-tcg-ar/#/treinador`);
await p.evaluate(() => localStorage.setItem('tcg-ar-onboarding-v1', '1'));
await p.goto(`http://localhost:${port}/pokemon-tcg-ar/?r=${Math.random()}#/${hash}`);
await p.waitForTimeout(2500);
await p.addStyleTag({ content: 'nav.tabs, .tabbar, footer{display:none!important}' });
const h0 = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, ...[...document.querySelectorAll("*")].map(e=>e.getBoundingClientRect().bottom+scrollY)));
const h = Math.floor(h0);  const step = 1100; let i = 0;
for (let y = 0; y < h - 2; y += step, i++) await p.screenshot({ path: `${out}-${i}.png`, fullPage: true, clip: { x: 0, y, width: size === "m" ? 375 : 1280, height: Math.min(step, h - y) } });
console.log(i, 'clips');
await b.close();

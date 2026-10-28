// uso: node .claude/arena-page.mjs <hash> <saida.png> [porta] [m|d]  (página inteira numa imagem)
import { chromium } from 'playwright';
const [hash, out, port = '5192', size = 'm'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'msedge' });
const ctx = await b.newContext({ viewport: size === 'm' ? { width: 375, height: 812 } : { width: 1280, height: 800 }, hasTouch: size === 'm' });
const p = await ctx.newPage();
await p.goto(`http://localhost:${port}/pokemon-tcg-ar/#/treinador`);
await p.evaluate(() => localStorage.setItem('tcg-ar-onboarding-v1', '1'));
await p.goto(`http://localhost:${port}/pokemon-tcg-ar/?r=${Math.random()}#/${hash}`);
await p.waitForTimeout(2500);
await p.screenshot({ path: out, fullPage: true });
await b.close();

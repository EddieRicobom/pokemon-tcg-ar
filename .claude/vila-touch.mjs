import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.clock.setFixedTime(new Date('2026-10-17T12:00:00'));
await page.goto('http://localhost:5173/pokemon-tcg-ar/?r=5#/vila');
await page.waitForTimeout(6000);
for (let n = 0; n < 6; n++) { const b = page.getByRole('button', { name: /Continuar|Entendi|OK/ }).first(); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(300); } }
await page.screenshot({ path: `${out}-0.png` });
// arrastar: joystick flutuante aparece onde encostou
await page.mouse.move(120, 420);
await page.mouse.down();
await page.mouse.move(180, 420, { steps: 6 });
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}-1.png` });
await page.mouse.up();
await page.waitForTimeout(500);
// toque rápido num lugar: vai andando até lá
await page.touchscreen.tap(300, 250);
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-2.png` });
await browser.close();

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Contrato de layout da casca: a interface pode rolar, mas nada de cima (cabeçalho, modos, abas fixas) pode se
 * sobrepor, o rodapé precisa escapar da barra de abas no fim da rolagem e a página não pode vazar na horizontal.
 * Roda no Chromium do Playwright, que mede o layout de verdade (o Vitest/happy-dom não calcula caixas).
 */

const base = process.env.BASE_PATH ?? '/pokemon-tcg-ar/';
const routes = [
  { name: 'escanear', hash: '#/' },
  { name: 'cartas', hash: '#/cartas' },
  { name: 'treinador', hash: '#/treinador' },
  { name: 'diagnostico', hash: '#/diagnostico' },
] as const;

interface Box { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function open(page: Page, hash: string): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-install-hint-dismissed-v1', '1');
  });
  await page.goto(`${base}${hash}`);
  await expect(page.locator('main.app')).toBeVisible();
  await page.waitForFunction(() => !document.body.innerText.includes('Abrindo a tela'));
  await page.waitForTimeout(600);
}

async function box(page: Page, selector: string): Promise<Box | null> {
  const locator = page.locator(selector).first();
  if (!(await locator.count()) || !(await locator.isVisible())) return null;
  return locator.boundingBox();
}

/** Confere os elementos fixos/de topo e as caixas em fluxo da casca. */
async function expectShellWithoutOverlap(page: Page): Promise<void> {
  const header = await box(page, '.app-header');
  const tabs = await box(page, '.tabs');
  const modes = await box(page, '.modes');
  expect(header, 'cabeçalho da casca').not.toBeNull();
  expect(tabs, 'barra de abas').not.toBeNull();
  if (modes && header) expect(overlaps(header, modes), 'cabeçalho sobre os modos').toBe(false);
  if (tabs && header) expect(overlaps(header, tabs), 'cabeçalho sob as abas fixas').toBe(false);
  if (tabs && modes) expect(overlaps(modes, tabs), 'modos sob as abas fixas').toBe(false);

  // A barra fica por cima do conteúdo: fundo translúcido deixaria o texto de baixo aparecer entre os rótulos.
  const tabAlpha = await page.evaluate(() => {
    const color = getComputedStyle(document.querySelector('.tabs')!).backgroundColor;
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return 1;
    const parts = match[1].split(',').map(Number);
    return parts.length < 4 ? 1 : parts[3]!;
  });
  expect(tabAlpha, 'fundo da barra de abas precisa ser opaco').toBeGreaterThanOrEqual(0.99);

  // Itens diretos da grade da casca (cartões e telas) não podem se sobrepor.
  const flow = await page.evaluate(() => [...document.querySelectorAll('main.app > *')]
    .filter((element) => {
      const style = getComputedStyle(element);
      return style.position !== 'fixed' && style.display !== 'contents' && element.getClientRects().length > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName.toLowerCase(), cls: typeof element.className === 'string' ? element.className : '', x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
  for (let i = 0; i < flow.length; i++) {
    for (let j = i + 1; j < flow.length; j++) {
      expect(overlaps(flow[i]!, flow[j]!), `itens da casca se sobrepõem: ${flow[i]!.tag}.${flow[i]!.cls} × ${flow[j]!.tag}.${flow[j]!.cls}`).toBe(false);
    }
  }
}

/** Cabeçalho e conteúdo de fluxo não podem vazar na horizontal. */
async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'largura extra além da viewport').toBeLessThanOrEqual(1);
}

for (const size of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test.describe(`layout compacto ${size.width}×${size.height}`, () => {
    test.use({ viewport: size });

    for (const route of routes) {
      test(`${route.name}: sem sobreposição e com o rodapé livre no fim`, async ({ page }) => {
        await open(page, route.hash);
        await expectShellWithoutOverlap(page);
        await expectNoHorizontalOverflow(page);

        // No fim da rolagem, tudo (inclusive o rodapé) precisa ficar acima da barra fixa de abas.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(150);
        const footer = await box(page, '.app-footer a:last-child');
        const tabs = await box(page, '.tabs');
        if (footer && tabs) expect(footer.y + footer.height, 'rodapé atrás da barra de abas').toBeLessThanOrEqual(tabs.y + 1);
      });
    }
  });
}

test.describe('avisos e controles', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('os avisos de recompensa não cobrem o cabeçalho', async ({ page }) => {
    await open(page, '#/cartas');
    await page.evaluate(() => {
      const holder = document.createElement('div');
      holder.className = 'reward-toasts';
      holder.id = 'layout-toast-test';
      const toast = document.createElement('div');
      toast.style.cssText = 'width:180px;height:40px;background:#000;';
      holder.appendChild(toast);
      document.body.appendChild(holder);
    });
    const header = await box(page, '.app-header');
    const toast = await box(page, '#layout-toast-test > div');
    expect(header).not.toBeNull();
    expect(toast).not.toBeNull();
    expect(overlaps(header!, toast!), 'aviso de recompensa sobre o cabeçalho').toBe(false);
  });

  test('em paisagem, os controles universais ficam acima das abas e do rodapé', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, '#/cartas');
    const controls = await box(page, '.universal-controls');
    const tabs = await box(page, '.tabs');
    expect(controls, 'controles universais em paisagem').not.toBeNull();
    expect(tabs).not.toBeNull();
    expect(overlaps(controls!, tabs!), 'controles sobre as abas').toBe(false);

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(150);
    const footer = await box(page, '.app-footer a:last-child');
    if (footer) expect(footer.y + footer.height, 'rodapé atrás dos controles').toBeLessThanOrEqual(controls!.y + 1);
  });
});

/** PvP do Survival entre DOIS navegadores: sala por códigos manuais (sem depender dos brokers MQTT), 3 runs de 2 min em cada
 * um, equipe 3x3 e arena em tempo real até alguém vencer. Dura ~9 min (as runs são reais: 3 × 2 min, e a luta até ~3 min).
 * Não roda no CI. APP_URL=http://127.0.0.1:4175/pokemon-tcg-ar/ BROWSER_PATH=<opcional> SCREENSHOT_DIR=<opcional> node e2e/survival-pvp.mjs
 * Os moradores são Digital Pokémon de um save de teste; os sprites (GIF) vêm da rede: sem rede a arena mostra círculos com a sigla
 * (e o script segue). Valida a lógica de rede, as telas e o fim da luta; NÃO valida toque real, desempenho nem latência de celular. */
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.APP_URL ?? 'http://127.0.0.1:4175/pokemon-tcg-ar/';
const shots = process.env.SCREENSHOT_DIR;
if (shots) await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });

async function openPlayer(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/Failed to load resource|net::ERR/.test(message.text())) errors.push(message.text()); });
  await page.addInitScript((who) => {
    localStorage.setItem('tcg-ar-onboarding-v1', '1');
    localStorage.setItem('tcg-ar-perfil-v1', JSON.stringify({ name: who, sprite: 'red' }));
    localStorage.setItem('tcg-ar-vila-controls-hint-hidden-v1', 'true');
    const grantedAt = '2026-10-01T10:00:00.000Z';
    const mon = (i, dexId, n, originCardId) => ({ instanceId: `digital:${i}`, originCardId, dexId, name: n, isDigitalPokemon: true, source: 'presente', grantedAt, stage: 0 });
    const all = [mon(1, 1, 'Bulbasaur', 'base1-44'), mon(2, 4, 'Charmander', 'base1-46'), mon(3, 7, 'Squirtle', 'base1-63'), mon(4, 25, 'Pikachu', 'base1-58'), mon(5, 39, 'Jigglypuff', 'base1-54'), mon(6, 52, 'Meowth', 'base1-56')];
    localStorage.setItem('tcg-ar-vila-v1', JSON.stringify({
      v: 1, layout: 2, seed: 20261014, house: 6, player: { x: 45, y: 41, dir: 'down' }, coins: 500,
      digital: { introSeen: true, tutorialSeen: true, starterGiven: true, ledger: [], instances: all },
      recap: { day: '2026-10-23', at: Date.now() }, lastSeen: Date.now(),
    }));
  }, name);
  await page.goto(`${base}#/vila`, { waitUntil: 'commit', timeout: 120_000 });
  await page.waitForSelector('.village-pad');
  await page.getByRole('button', { name: /Abrir o menu da Vila/ }).click();
  await page.getByRole('button', { name: /Survival/ }).click();
  await page.getByRole('button', { name: /PvP com um amigo/ }).click();
  return { page, errors, name };
}

const shot = async (p, label) => { if (shots) await p.page.screenshot({ path: `${shots}/svpvp-${p.name}-${label}.png` }); };

const host = await openPlayer('Anfitriao');
const guest = await openPlayer('Convidado');
try {
  // Pareamento pela reserva de códigos manuais.
  await host.page.getByText(/Sem ponto de encontro/).click();
  await host.page.getByRole('button', { name: /Gerar convite/ }).click();
  const invite = await host.page.locator('#pvp-my-code').inputValue();
  assert.ok(invite.length > 20, 'convite gerado');
  await guest.page.getByText(/Sem ponto de encontro/).click();
  await guest.page.getByRole('button', { name: /Tenho um convite/ }).click();
  await guest.page.locator('#pvp-paste-offer').fill(invite);
  await guest.page.getByRole('button', { name: /Gerar resposta/ }).click();
  const answer = await guest.page.locator('#pvp-my-answer').inputValue();
  await host.page.locator('#pvp-paste').fill(answer);
  await host.page.getByRole('button', { name: 'Conectar' }).click();

  // 3 runs de 2 minutos: escolhe o primeiro Pokémon sorteado e espera o fim da run.
  for (let run = 0; run < 3; run++) {
    for (const p of [host, guest]) {
      await p.page.locator('.survivor-pick-btn').first().waitFor({ timeout: 60_000 });
      assert.match(await p.page.locator('.survivor-pick h2').innerText(), new RegExp(`run ${run + 1} de 3`));
      await p.page.locator('.survivor-pick-btn').first().click();
      await p.page.locator('.survivor-pvp-chip').waitFor({ timeout: 60_000 });
    }
    await shot(host, `run${run + 1}`);
    for (const p of [host, guest]) {
      await p.page.getByRole('region', { name: 'Run concluída' }).or(p.page.getByRole('region', { name: 'Equipe pronta' })).or(p.page.locator('.svp-arena')).waitFor({ timeout: 180_000 });
    }
    if (run < 2) for (const p of [host, guest]) await p.page.getByRole('button', { name: new RegExp(`Run ${run + 2} de 3`) }).click();
  }

  // Arena: os dois entram juntos e a luta termina para os dois com o mesmo vencedor.
  for (const p of [host, guest]) await p.page.locator('.svp-arena').waitFor({ timeout: 120_000 });
  await host.page.waitForTimeout(4000);
  await shot(host, 'arena');
  await shot(guest, 'arena');
  for (const p of [host, guest]) assert.match(await p.page.locator('.svp-summary').innerText(), /\d:\d\d/, 'a luta saiu da contagem e o relógio anda');
  await host.page.keyboard.down('ArrowLeft');
  await host.page.waitForTimeout(600);
  await host.page.keyboard.up('ArrowLeft');
  await host.page.getByRole('button', { name: /^2:/ }).click();
  await host.page.locator('.svp-result').waitFor({ timeout: 240_000 });
  await guest.page.locator('.svp-result').waitFor({ timeout: 30_000 });
  const verdict = async (p) => (await p.page.locator('.svp-card h3').innerText()).trim();
  const [a, b] = [await verdict(host), await verdict(guest)];
  console.log('resultado:', a, '|', b);
  assert.ok((/venceu!/.test(a) && /Anfitriao venceu/.test(b)) || (/Convidado venceu/.test(a) && /venceu!/.test(b)) || (a === 'Empate' && b === 'Empate'), 'os dois veem o mesmo resultado');
  await shot(host, 'fim');
  for (const p of [host, guest]) assert.deepEqual(p.errors, [], `${p.name}: sem erros de página`);
  console.log('ok: lobby → 3 runs → arena → resultado igual nos dois navegadores');
} finally {
  await browser.close();
}

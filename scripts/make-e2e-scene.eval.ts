/**
 * Gera as cenas (PNG 1920×1080) que viram o "vídeo da câmera falsa" do teste de ponta a ponta no CI.
 * Cada cena é um escaneamento oficial do TCGdex (high.png) colocado, com perspectiva e ruído leves,
 * sobre um fundo liso: o mesmo gerador usado na avaliação do reconhecimento (nível "fácil").
 *
 *   E2E_CARDS=base1-4,base5-53 npx vitest run --config vitest.eval.config.ts scripts/make-e2e-scene.eval.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { cardImageUrl, TcgdexClient } from '../src/recognition/tcgdex';
import { decodePng, download, encodePng, makeScene } from './eval-common';

const CARDS = (process.env.E2E_CARDS ?? 'base1-4,base5-53,sv03.5-025,swsh1-65').split(',').map((s) => s.trim()).filter(Boolean);
const OUT = process.env.E2E_OUT ?? 'e2e/.tmp';

it('gera as cenas do teste de ponta a ponta', async () => {
  mkdirSync(OUT, { recursive: true });
  const client = new TcgdexClient({ backoffMs: 300 });
  const written: string[] = [];
  const references: Record<string, string> = {};
  for (const id of CARDS) {
    const card = await client.getCard(id);
    if (!card?.image) continue;
    const scan = decodePng(await download(`${card.image}/high.png`));
    const referenceUrl = cardImageUrl(card.image, 'low', 'webp');
    writeFileSync(`${OUT}/${id}-reference.webp`, await download(referenceUrl));
    references[referenceUrl] = `${id}-reference.webp`;
    const { scene } = makeScene(scan, 1234, 'facil');
    writeFileSync(`${OUT}/${id}.png`, encodePng(scene));
    written.push(id);
  }
  writeFileSync(`${OUT}/cards.json`, JSON.stringify(written));
  writeFileSync(`${OUT}/references.json`, JSON.stringify(references, null, 2));
  expect(written.length).toBeGreaterThan(0);
});

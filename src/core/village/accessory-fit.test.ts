import { describe, expect, it } from 'vitest';
import { ACCESSORY_POSITIONS, headHeight, placeAccessory, replacesHeadGear } from './accessory-fit';
import type { BodyBox } from './accessory-fit';
import { ACCESSORY_IDS, itemDef } from './catalog';

// Corpo de 12×24 (o treinador) e um Pokémon redondo e baixinho de 16×14, em pixels de tela com `unit` = 1.
const tall: BodyBox = { left: 2, top: 0, w: 12, h: 24, headX: 8, headTop: 1 };
const round: BodyBox = { left: 0, top: 10, w: 16, h: 14, headX: 8, headTop: 10 };
const art = { w: 10, h: 6 };

describe('placeAccessory', () => {
  it('assenta o chapéu sobre a cabeça, sem flutuar acima dela', () => {
    for (const body of [tall, round]) {
      const p = placeAccessory('hat', art, 1, body);
      expect(p.y + p.h).toBeGreaterThan(body.headTop);
      expect(p.y + p.h).toBeLessThan(body.headTop + headHeight(body));
      expect(p.x + p.w / 2).toBeCloseTo(body.headX, 0);
    }
  });

  it('desce na ordem cabeça, olhos, boca, pescoço, peito e cintura', () => {
    const order = (['hat', 'face', 'mouth', 'neck', 'chest', 'waist'] as const).map((pos) => {
      const p = placeAccessory(pos, { w: 4, h: 2 }, 1, tall);
      return p.y + p.h / 2;
    });
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThan(order[i - 1]!);
  });

  it('põe capas e asas atrás do corpo e o que se segura ao lado dele', () => {
    expect(placeAccessory('back', art, 1, tall).behind).toBe(true);
    const hand = placeAccessory('hand', { w: 4, h: 10 }, 1, tall);
    expect(hand.behind).toBe(false);
    expect(hand.x + hand.w / 2).toBeGreaterThan(tall.left + tall.w * 0.75);
  });

  it('de costas esconde o rosto e traz a capa para a frente', () => {
    expect(placeAccessory('face', art, 1, tall, 'back').hidden).toBe(true);
    expect(placeAccessory('mouth', art, 1, tall, 'back').hidden).toBe(true);
    expect(placeAccessory('back', art, 1, tall, 'back').behind).toBe(false);
    expect(placeAccessory('hat', art, 1, tall, 'back').hidden).toBe(false);
  });

  it('de perfil, o que se segura vai para a frente e a capa para as costas', () => {
    const cx = tall.left + tall.w / 2;
    const handR = placeAccessory('hand', { w: 4, h: 8 }, 1, tall, 'right');
    const handL = placeAccessory('hand', { w: 4, h: 8 }, 1, tall, 'left');
    expect(handR.x + handR.w / 2).toBeGreaterThan(cx);
    expect(handL.x + handL.w / 2).toBeLessThan(cx);
    const backR = placeAccessory('back', { w: 8, h: 6 }, 1, tall, 'right');
    expect(backR.x + backR.w / 2).toBeLessThan(cx);
    expect(backR.behind).toBe(true);
  });

  it('usa o pixel do tileset: o tamanho na tela é o desenho vezes a unidade', () => {
    const p = placeAccessory('hat', art, 3, { ...tall, left: 6, w: 36, h: 72, headX: 24, headTop: 3 });
    expect(p.w).toBe(30);
    expect(p.h).toBe(18);
  });

  it('aplica o ajuste fino do item em pixels do desenho', () => {
    const a = placeAccessory('hat', art, 3, tall);
    const b = placeAccessory('hat', art, 3, tall, 'front', { dy: -3 });
    expect(a.y - b.y).toBe(9);
  });

  it('só os de cabeça tiram o chapéu do treinador', () => {
    expect(replacesHeadGear('hat')).toBe(true);
    expect(replacesHeadGear('ear')).toBe(false);
    expect(replacesHeadGear(undefined)).toBe(false);
  });
});

describe('acessórios do catálogo', () => {
  it('todo acessório tem um lugar no corpo conhecido', () => {
    for (const id of ACCESSORY_IDS) expect(ACCESSORY_POSITIONS).toContain(itemDef(id)?.pos);
  });

  it('tem ao menos 150 acessórios, com nomes únicos', () => {
    expect(ACCESSORY_IDS.length).toBeGreaterThanOrEqual(150);
    const names = ACCESSORY_IDS.map((id) => itemDef(id)!.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

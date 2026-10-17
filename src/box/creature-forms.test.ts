import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BoxCreature, creatureHeightMeters, creatureSizeFor, MEGA_MAX_GROWTH } from './creature';
import type { CreatureSource } from './creature';
import { createWander } from './wander';

function image(width: number, height: number, rgba: [number, number, number, number] = [200, 50, 50, 255]): CreatureSource {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set(rgba, p * 4);
  return { kind: 'image', image: { width, height, data } };
}

function make(source: CreatureSource, extra: Partial<BoxCreature['info']> = {}): BoxCreature {
  return new BoxCreature({ id: 'c1', name: 'Gallade', dexId: 475, detail: 'x', ...extra }, source, createWander(1, () => 0.5));
}

const tick = (c: BoxCreature, now = 1000) => c.update(now, 16, new Vector3(), new Vector3(0, 2, 3), new Vector3(1, 0, 0));

describe('Pokémon shiny na Caixa', () => {
  it('nasce sem brilho; com info.shiny o brilho já vem ligado, pendurado no plano do Pokémon', () => {
    const normal = make(image(32, 32));
    expect(normal.shiny).toBe(false);
    const shiny = make(image(32, 32), { shiny: true });
    expect(shiny.shiny).toBe(true);
    // halo + 6 estrelinhas dentro de um grupo, filho do plano
    expect(shiny.mesh.children.length).toBe(1);
    expect(shiny.mesh.children[0]!.children.length).toBe(7);
    expect(normal.mesh.children.length).toBe(0);
  });

  it('liga e desliga sem deixar sobras, e anima a cada quadro', () => {
    const c = make(image(32, 32));
    c.setShiny(true);
    c.setShiny(true);
    expect(c.mesh.children.length).toBe(1);
    tick(c, 100);
    tick(c, 900);
    const star = c.mesh.children[0]!.children[1] as unknown as { material: { opacity: number } };
    expect(star.material.opacity).toBeGreaterThanOrEqual(0);
    c.setShiny(false);
    expect(c.shiny).toBe(false);
    expect(c.mesh.children.length).toBe(0);
  });

  it('desmaiado, o brilho some', () => {
    const c = make(image(32, 32), { shiny: true });
    c.fx.faint = 1;
    tick(c);
    expect(c.mesh.children[0]!.visible).toBe(false);
    c.fx.faint = 0;
    tick(c);
    expect(c.mesh.children[0]!.visible).toBe(true);
  });

  it('dispose libera o brilho', () => {
    const c = make(image(32, 32), { shiny: true });
    c.dispose();
    expect(c.shiny).toBe(false);
  });
});

describe('forma Mega na Caixa', () => {
  it('troca de sprite muda tamanho e forma; restoreForm devolve o original', () => {
    const base = image(40, 40);
    const c = make(base);
    const before = { w: c.width, h: c.height };
    expect(c.isMegaForm).toBe(false);
    c.setForm(image(40, 90, [20, 200, 20, 255]));
    expect(c.isMegaForm).toBe(true);
    // Gallade tem altura real: a Mega cresce pela arte (90 px contra 40 px), até 1,5×.
    expect(c.height).toBeCloseTo(before.h * MEGA_MAX_GROWTH, 6);
    expect(c.width).toBeCloseTo(c.height * (40 / 90), 6);
    expect(c.height).toBeGreaterThan(before.h);
    tick(c);
    expect(c.mesh.scale.y).toBeCloseTo(c.height, 6);
    c.restoreForm();
    expect(c.isMegaForm).toBe(false);
    expect(c.width).toBeCloseTo(before.w, 6);
    expect(c.height).toBeCloseTo(before.h, 6);
  });

  it('a transformação dá um pulinho e mostra a faísca; voltar à forma normal limpa o balão', () => {
    const c = make(image(32, 32));
    c.setForm(image(32, 48));
    expect(c.bubbleEmoji).toBe('⚡');
    c.restoreForm();
    expect(c.bubbleEmoji).toBeNull();
  });

  it('restoreForm sem ter trocado não faz nada', () => {
    const c = make(image(32, 32));
    c.say('😊', 1000);
    c.restoreForm();
    expect(c.bubbleEmoji).toBe('😊');
  });

  it('trocar de forma não perde o brilho shiny', () => {
    const c = make(image(32, 32), { shiny: true });
    c.setForm(image(32, 64));
    expect(c.shiny).toBe(true);
    c.restoreForm();
    expect(c.shiny).toBe(true);
  });

  it('sprite sem quadros é recusado e não estraga o que estava', () => {
    const c = make(image(32, 32));
    expect(() => c.setForm({ kind: 'gif', gif: { width: 8, height: 8, frames: [], totalMs: 0 } as never })).toThrow('Sprite sem quadros');
    expect(c.isMegaForm).toBe(false);
    expect(c.height).toBeCloseTo(creatureSizeFor(475, image(32, 32)), 6);
  });
});

describe('tamanho pela altura real na Caixa', () => {
  it('Pokémon maior na vida real fica maior, mesmo com sprites do mesmo tamanho', () => {
    const pikachu = make(image(40, 40), { dexId: 25 });
    const snorlax = make(image(40, 40), { dexId: 143 });
    expect(snorlax.height).toBeGreaterThan(pikachu.height * 1.6);
  });

  it('a margem transparente do quadro não muda o tamanho do desenho', () => {
    const full = image(40, 40);
    const padded = image(40, 80);
    if (padded.kind === 'image') padded.image.data.fill(0, 0, 40 * 40 * 4); // metade de cima vazia
    expect(creatureSizeFor(25, padded) * 0.5).toBeCloseTo(creatureSizeFor(25, full), 6);
  });

  it('sem dado de altura, segue pelo tamanho do desenho, como antes', () => {
    expect(creatureSizeFor(undefined, image(40, 90))).toBeCloseTo(creatureHeightMeters(90), 6);
    expect(creatureSizeFor(99999, image(40, 90))).toBeCloseTo(creatureHeightMeters(90), 6);
  });
});

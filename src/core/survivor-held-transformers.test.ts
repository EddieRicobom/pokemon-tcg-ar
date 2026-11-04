import { describe, expect, it } from 'vitest';
import { HELD_ITEMS, HELD_OFFER_PREFIX, HELD_TRANSFORMER_MAX_COPIES, heldMaxCopies, heldItemAppliesTo, rollHeldOffer } from './survivor-held';
import type { HeldItemId } from './survivor-held';
import { applyUpgrade, createSurvivorState, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorState } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';

const CATEGORIES: MoveCategory[] = ['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha'];
const TRANSFORMERS: HeldItemId[] = ['orbe-adamante', 'orbe-lustroso', 'orbe-grisea', 'laco-destino', 'bola-ferro', 'erva-poderosa'];
/** Inimigos parados em volta do Pokémon, em várias distâncias e lados, para todas as formas acharem alvo. */
const LAYOUT: [number, number][] = [[40, 0], [70, 10], [100, -10], [130, 0], [160, 20], [-90, 0], [0, 90], [60, -80], [200, 0], [-150, 30], [119, 5], [-119, 0]];

function stateFor(category: MoveCategory, items: HeldItemId[]): SurvivorState {
  const move = { ...moveFor(['normal'], null), category, estimated: false };
  const s = createSurvivorState(11, { kindCount: 1, move, profile: attackProfile(move, null) });
  s.nextBossAtMs = Number.POSITIVE_INFINITY;
  s.spawnAccumMs = -1e9;
  for (const id of items) {
    s.pendingUpgrade = [{ id: `${HELD_OFFER_PREFIX}${id}`, name: id, description: '' }];
    applyUpgrade(s, `${HELD_OFFER_PREFIX}${id}`);
  }
  LAYOUT.forEach(([dx, dy], index) => {
    const e: SurvivorEnemy = { id: 900 + index, kind: 0, boss: false, grade: 'comum', x: s.player.x + dx, y: s.player.y + dy, hp: 1e6, maxHp: 1e6, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
    s.enemies.push(e);
  });
  if (category === 'trilha') s.player.trailCharge = 1;
  return s;
}

interface Seen { fx: Set<string>; bubbles: boolean; wells: boolean; linked: boolean; mirrorOrbit: boolean; mirrorTrail: boolean; charges: number; queue: boolean; projectiles: boolean; moved: boolean }

/** Roda ~7 s segurando e soltando a carga como cada forma pede, e anota o que apareceu. */
function run(category: MoveCategory, items: HeldItemId[]): { s: SurvivorState; seen: Seen } {
  const s = stateFor(category, items);
  const start = new Map(s.enemies.map((e) => [e.id, { x: e.x, y: e.y }]));
  const seen: Seen = { fx: new Set(), bubbles: false, wells: false, linked: false, mirrorOrbit: false, mirrorTrail: false, charges: 0, queue: false, projectiles: false, moved: false };
  for (let i = 0; i < 450; i++) {
    const charge = category === 'teleporte' ? i % 100 < 80 : category === 'foco' ? i < 260 : category === 'trilha';
    const dx = category === 'trilha' ? (Math.floor(i / 50) % 2 === 0 ? 1 : -1) : 0;
    stepSurvivor(s, { dx, dy: 0, charge }, 16);
    if (s.pendingUpgrade) s.pendingUpgrade = null;
    for (const f of s.fx) seen.fx.add(f.kind);
    seen.bubbles ||= (s.timeBubbles?.length ?? 0) > 0;
    seen.wells ||= (s.gravityWells?.length ?? 0) > 0;
    seen.linked ||= s.enemies.some((e) => e.linkId !== undefined);
    seen.mirrorOrbit ||= s.enemies.some((e) => (e.mirrorOrbitHitMs ?? 0) > 0);
    seen.mirrorTrail ||= (s.player.trailMirrorPath?.length ?? 0) > 0;
    seen.charges = Math.max(seen.charges, s.heldCharges?.length ?? 0);
    seen.queue ||= (s.heldQueue?.length ?? 0) > 0;
    seen.projectiles ||= s.projectiles.length > 0;
    seen.moved ||= s.enemies.some((e) => { const p = start.get(e.id); return !!p && Math.hypot(e.x - p.x, e.y - p.y) > 3; });
  }
  return { s, seen };
}

const SIGNATURE: Partial<Record<HeldItemId, (seen: Seen, category: MoveCategory) => boolean>> = {
  'orbe-adamante': (seen) => seen.bubbles || seen.fx.has('bubble-pop'),
  'orbe-lustroso': (seen) => seen.fx.has('portal'),
  'orbe-grisea': (seen) => seen.fx.has('distort') || seen.mirrorOrbit || seen.mirrorTrail,
  'laco-destino': (seen) => seen.linked,
  'bola-ferro': (seen, category) => seen.wells || seen.fx.has('implode') || ((category === 'aura' || category === 'orbit' || category === 'trilha') && seen.moved),
  'erva-poderosa': (seen, category) => seen.charges > 0 || seen.queue || seen.fx.has('implode') || (category === 'orbit' && seen.projectiles),
};

describe('transformadores', () => {
  it('são 6, raros no baú, com teto de 2 cópias e valendo para todas as formas', () => {
    const transformers = HELD_ITEMS.filter((item) => item.transformer);
    expect(transformers.map((item) => item.id).sort()).toEqual([...TRANSFORMERS].sort());
    for (const item of transformers) {
      expect(heldMaxCopies(item.id)).toBe(HELD_TRANSFORMER_MAX_COPIES);
      expect(item.generation).toBeLessThanOrEqual(4);
      for (const category of CATEGORIES) {
        expect(heldItemAppliesTo(item.id, category)).toBe(true);
        expect(item.perCategory?.[category]?.length ?? 0).toBeGreaterThan(10);
      }
    }
  });

  it('a segunda carta do baú pode ser um transformador; Bola de Ferro e Erva Poderosa saem mais', () => {
    const counts = new Map<HeldItemId, number>();
    let seed = 3;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    let transformerSlots = 0;
    for (let i = 0; i < 4000; i++) {
      const offer = rollHeldOffer(rng, {}, 2, 'projetil');
      expect(new Set(offer).size).toBe(offer.length);
      const last = offer[offer.length - 1]!;
      if (HELD_ITEMS.find((item) => item.id === last)?.transformer) {
        transformerSlots++;
        counts.set(last, (counts.get(last) ?? 0) + 1);
      }
      expect(HELD_ITEMS.find((item) => item.id === offer[0])?.transformer).not.toBe(true);
    }
    expect(transformerSlots / 4000).toBeGreaterThan(0.2);
    expect(transformerSlots / 4000).toBeLessThan(0.4);
    expect(counts.get('bola-ferro') ?? 0).toBeGreaterThan(counts.get('orbe-adamante') ?? 0);
    expect(counts.get('erva-poderosa') ?? 0).toBeGreaterThan(counts.get('laco-destino') ?? 0);
    // Com 2 cópias, o transformador sai do sorteio.
    for (let i = 0; i < 200; i++) expect(rollHeldOffer(rng, { 'bola-ferro': 2 }, 2)).not.toContain('bola-ferro');
  });

  for (const item of TRANSFORMERS) {
    for (const category of CATEGORIES) {
      it(`${item} deixa sua marca em ${category}, sem números quebrados`, () => {
        const { s, seen } = run(category, [item]);
        expect(SIGNATURE[item]?.(seen, category)).toBe(true);
        expect(Number.isFinite(s.player.x) && Number.isFinite(s.player.y)).toBe(true);
        for (const e of s.enemies) expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp)).toBe(true);
        // Nada cresce sem teto.
        expect(s.projectiles.length).toBeLessThanOrEqual(400);
        expect(s.fx.length).toBeLessThanOrEqual(600);
        expect(s.gravityWells?.length ?? 0).toBeLessThanOrEqual(8);
        expect(s.timeBubbles?.length ?? 0).toBeLessThanOrEqual(10);
      });
    }
  }

  it('os seis juntos, com 2 cópias cada, continuam estáveis em todas as formas', () => {
    const all = TRANSFORMERS.flatMap((id) => [id, id]);
    for (const category of CATEGORIES) {
      const { s } = run(category, all);
      for (const e of s.enemies) expect(Number.isFinite(e.hp)).toBe(true);
      expect(s.projectiles.length).toBeLessThanOrEqual(400);
    }
  });

  it('Bola de Ferro na área: o buraco negro tem o triplo da área e puxa o grupo', () => {
    const s = stateFor('area', ['bola-ferro']);
    const radius = s.player.attackRadius;
    let wellRadius = 0;
    for (let i = 0; i < 120 && wellRadius === 0; i++) {
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      wellRadius = s.gravityWells?.[0]?.radius ?? 0;
    }
    expect(wellRadius).toBeCloseTo(radius * 3, 0);
  });

  it('Erva Poderosa na rajada: junta 6 tiros flutuando e solta em sequência', () => {
    const s = stateFor('rapido', ['erva-poderosa']);
    let most = 0;
    let fired = 0;
    for (let i = 0; i < 120; i++) {
      stepSurvivor(s, { dx: 0, dy: 0 }, 16);
      most = Math.max(most, s.heldCharges?.length ?? 0);
      fired = Math.max(fired, s.projectiles.length);
    }
    expect(most).toBe(6);
    expect(fired).toBeGreaterThan(0);
  });
});

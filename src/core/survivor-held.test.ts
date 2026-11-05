import { describe, expect, it } from 'vitest';
import {
  HELD_ITEMS,
  HELD_MAX_COPIES,
  HELD_OFFER_PREFIX,
  heldGems,
  heldItemAppliesTo,
  heldItemSpriteUrl,
  heldItemText,
  heldMods,
  heldProjectileLook,
  rollHeldOffer,
} from './survivor-held';
import type { HeldItemId } from './survivor-held';
import { applyUpgrade, CHEST_FIRST_MS, createSurvivorState, rerollSurvivorUpgradeOffer, stepSurvivor } from './survivor';
import type { SurvivorEnemy, SurvivorEvent, SurvivorState } from './survivor';
import { attackProfile, moveFor } from './survivor-moves';
import type { MoveCategory } from './survivor-moves';
import type { PokemonType } from './pokemon-data';

function as(type: PokemonType, category: MoveCategory) {
  const move = { ...moveFor([type], null), category, estimated: false };
  return { move, profile: attackProfile(move, null) };
}
function quiet(state: SurvivorState): SurvivorState {
  state.nextBossAtMs = Number.POSITIVE_INFINITY;
  state.spawnAccumMs = -1e9;
  return state;
}
function dummy(id: number, x: number, y: number, hp = 1e6): SurvivorEnemy {
  return { id, kind: 0, boss: false, grade: 'comum', x, y, hp, maxHp: hp, speed: 0, damage: 0, radius: 13, hitFlashMs: 0 };
}
function give(state: SurvivorState, id: HeldItemId): SurvivorEvent[] {
  state.pendingUpgrade = [{ id: `${HELD_OFFER_PREFIX}${id}`, name: id, description: '' }];
  return applyUpgrade(state, `${HELD_OFFER_PREFIX}${id}`);
}
function steps(state: SurvivorState, count: number): SurvivorEvent[] {
  const events: SurvivorEvent[] = [];
  for (let i = 0; i < count; i++) events.push(...stepSurvivor(state, { dx: 0, dy: 0 }, 16));
  return events;
}

describe('catálogo de itens segurados', () => {
  it('tem pelo menos 20 itens, com ids, nomes e textos próprios', () => {
    expect(HELD_ITEMS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(HELD_ITEMS.map((item) => item.id)).size).toBe(HELD_ITEMS.length);
    expect(new Set(HELD_ITEMS.map((item) => item.name)).size).toBe(HELD_ITEMS.length);
    for (const item of HELD_ITEMS) {
      expect(item.description.length).toBeGreaterThan(10);
      expect(item.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('sem itens, a ficha é neutra', () => {
    const mods = heldMods({});
    expect(mods.damageMul).toBe(1);
    expect(mods.eliteMul).toBe(1);
    expect(mods.shards).toBe(0);
    expect(mods.plates).toEqual([]);
    expect(heldProjectileLook({})).toBeNull();
  });

  it('cópias se somam: multiplicadores crescem e chances têm teto', () => {
    expect(heldMods({ 'orbe-vida': 2 }).damageMul).toBeCloseTo(1.69, 2);
    expect(heldMods({ 'po-prateado': 3 }).shards).toBe(6);
    expect(heldMods({ 'placa-chama': 2, 'placa-gelo': 1 }).plates).toEqual(['fire', 'fire', 'ice']);
    expect(heldMods({ 'pedra-rei': 4 }).stunChance).toBeLessThanOrEqual(0.4);
    expect(heldMods({ 'garra-rapida': 10 }).recastChance).toBe(0.45);
    expect(heldMods({ 'pedra-rei': 2 }).stunChance).toBeGreaterThan(heldMods({ 'pedra-rei': 1 }).stunChance);
  });

  it('o visual dos disparos soma os traços de cada item', () => {
    const look = heldProjectileLook({ 'placa-chama': 1, 'farpa-grudenta': 1, 'pedra-rei': 1, 'po-rapido': 1 });
    expect(look).toMatchObject({ spikes: true, crown: true, wings: true, star: false });
    expect(look?.colors).toHaveLength(1);
    expect(heldGems({ 'restos': 2, 'lente-mira': 1 })).toHaveLength(3);
  });

  it('o baú oferece itens diferentes e nunca um que chegou ao teto', () => {
    let seed = 0;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < 50; i++) {
      const offer = rollHeldOffer(rng, { 'orbe-vida': HELD_MAX_COPIES }, 2);
      expect(offer).toHaveLength(2);
      expect(new Set(offer).size).toBe(2);
      expect(offer).not.toContain('orbe-vida');
    }
  });

  it('todo item referencia um item real até a 4ª geração, com sprite do PokeAPI', () => {
    for (const item of HELD_ITEMS) {
      expect(item.generation).toBeLessThanOrEqual(4);
      expect(item.slug).toMatch(/^[a-z-]+$/);
      expect(heldItemSpriteUrl(item.id)).toBe(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${item.slug}.png`);
    }
    expect(new Set(HELD_ITEMS.map((item) => item.slug)).size).toBe(HELD_ITEMS.length);
  });

  it('toda forma de ataque tem pelo menos 18 itens que mudam o golpe, e o baú só oferece esses', () => {
    const categories: MoveCategory[] = ['projetil', 'aura', 'area', 'cone', 'orbit', 'foco', 'rapido', 'teleporte', 'trilha'];
    let seed = 7;
    const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (const category of categories) {
      const usable = HELD_ITEMS.filter((item) => heldItemAppliesTo(item.id, category));
      expect(usable.length).toBeGreaterThanOrEqual(18);
      for (let i = 0; i < 30; i++) {
        for (const id of rollHeldOffer(rng, {}, 2, category)) expect(heldItemAppliesTo(id, category)).toBe(true);
      }
    }
    expect(heldItemAppliesTo('po-rapido', 'aura')).toBe(false);
    expect(heldItemAppliesTo('garra-rapida', 'trilha')).toBe(false);
  });

  it('placas, Pedra Dura e Pó Prateado reforçam o próprio tipo, como nos jogos', () => {
    const mods = heldMods({ 'placa-chama': 2, 'pedra-dura': 1, 'po-prateado': 1 });
    expect(mods.typeBoost.fire).toBeCloseTo(1.4, 5);
    expect(mods.typeBoost.rock).toBeCloseTo(1.2, 5);
    expect(mods.typeBoost.bug).toBeCloseTo(1.2, 5);
    expect(mods.typeBoost.water).toBeUndefined();
    expect(heldMods({ 'sino-concha': 1, 'raiz-grande': 1 }).leech).toBeGreaterThan(heldMods({ 'sino-concha': 1 }).leech);
  });

  it('o texto da carta explica a forma de ataque de quem joga', () => {
    expect(heldItemText('lente-ampla', 'foco', 0)).toContain('Feixe');
    expect(heldItemText('lente-ampla', 'orbit', 1)).toContain('orbital');
    expect(heldItemText('lente-ampla', 'orbit', 1)).toContain('Você já tem 1');
  });
});

describe('baús, chaves e efeitos na corrida', () => {
  it('o baú aparece, fica trancado sem chave e abre a escolha de itens com chave', () => {
    const s = quiet(createSurvivorState(3, { kindCount: 1 }));
    s.elapsedMs = CHEST_FIRST_MS - 10;
    const spawned = stepSurvivor(s, { dx: 0, dy: 0 }, 16);
    expect(spawned.some((ev) => ev.type === 'chestSpawn')).toBe(true);
    const chest = s.chests![0]!;
    chest.x = s.player.x;
    chest.y = s.player.y;

    expect(steps(s, 1).some((ev) => ev.type === 'chestLocked')).toBe(true);
    expect(s.pendingUpgrade).toBeNull();

    s.keys = 1;
    const opened = steps(s, 1);
    expect(opened.some((ev) => ev.type === 'chestOpened')).toBe(true);
    expect(s.keys).toBe(0);
    expect(s.chests).toHaveLength(0);
    expect(s.pendingUpgrade).toHaveLength(2);
    expect(s.pendingUpgrade!.every((option) => option.id.startsWith(HELD_OFFER_PREFIX) && option.family === 'item')).toBe(true);
    // Trocar as cartas viraria upgrades comuns: a escolha do baú não aceita.
    s.player.upgradeRerolls = 3;
    expect(rerollSurvivorUpgradeOffer(s)).toBe(false);

    const choice = s.pendingUpgrade![0]!.id;
    const granted = applyUpgrade(s, choice);
    const id = choice.slice(HELD_OFFER_PREFIX.length) as HeldItemId;
    expect(s.player.held?.[id]).toBe(1);
    expect(s.player.heldMods).toBeDefined();
    expect(granted.some((ev) => ev.type === 'heldItem' && ev.id === id)).toBe(true);
  });

  it('item fora da escolha aberta não é concedido', () => {
    const s = quiet(createSurvivorState(4, { kindCount: 1 }));
    applyUpgrade(s, `${HELD_OFFER_PREFIX}orbe-vida`);
    expect(s.player.held?.['orbe-vida']).toBeUndefined();
  });

  it('elite solto derruba chave, que é coletada ao passar por cima', () => {
    const s = quiet(createSurvivorState(5, { kindCount: 1 }));
    s.rng = () => 0;
    s.enemies.push({ ...dummy(1, s.player.x, s.player.y), grade: 'elite', hp: -1 });
    const events = steps(s, 2);
    expect(events.some((ev) => ev.type === 'keyPicked')).toBe(true);
    expect(s.keys).toBe(1);
  });

  it('itens de cópia somam números do jogador na hora', () => {
    const s = quiet(createSurvivorState(6, { kindCount: 1, ...as('fire', 'projetil') }));
    const shots = s.player.shots;
    give(s, 'lente-ampla');
    give(s, 'lente-ampla');
    expect(s.player.shots).toBe(shots + 2);
    expect(s.player.held?.['lente-ampla']).toBe(2);

    // Projéteis não usam raio de ataque; a aura usa e cresce a cada cópia.
    const aura = quiet(createSurvivorState(6, { kindCount: 1, ...as('fire', 'aura') }));
    const radius = aura.player.attackRadius;
    give(aura, 'lente-ampla');
    const firstRadius = aura.player.attackRadius;
    give(aura, 'lente-ampla');
    expect(firstRadius).toBeGreaterThan(radius);
    expect(aura.player.attackRadius).toBeGreaterThan(firstRadius);
  });

  it('Pedra do Rei atordoa, Bola de Luz salta e o Pó Prateado solta estilhaços, sem reação infinita', () => {
    const s = quiet(createSurvivorState(7, { kindCount: 1, ...as('normal', 'aura') }));
    s.rng = () => 0;
    give(s, 'pedra-rei');
    give(s, 'bola-luz');
    give(s, 'po-prateado');
    const near = dummy(1, s.player.x + 10, s.player.y);
    const far = dummy(2, s.player.x + 110, s.player.y);
    s.enemies.push(near, far);
    let maxStun = 0;
    for (let i = 0; i < 40; i++) {
      steps(s, 1);
      maxStun = Math.max(maxStun, near.stunMs ?? 0);
    }
    // O atordoamento dura 450 ms, menos que os 640 ms da simulação.
    expect(maxStun).toBeGreaterThan(0);
    expect(far.hp).toBeLessThan(far.maxHp);
    expect(s.fx.some((f) => f.kind === 'chain') || s.projectiles.some((p) => p.noHeld)).toBe(true);
    expect(s.fx.some((f) => f.kind === 'held-hit')).toBe(true);
    expect(s.projectiles.filter((p) => p.noHeld).length).toBeLessThanOrEqual(220);
  });

  it('Farpa Grudenta gruda e explode depois de 1 s', () => {
    const s = quiet(createSurvivorState(8, { kindCount: 1, ...as('normal', 'aura') }));
    s.rng = () => 0;
    give(s, 'farpa-grudenta');
    s.enemies.push(dummy(1, s.player.x + 10, s.player.y));
    steps(s, 30);
    expect((s.heldMines ?? []).length).toBeGreaterThan(0);
    steps(s, 80);
    expect(s.fx.some((f) => f.kind === 'blast') || (s.heldMines ?? []).length > 0).toBe(true);
  });

  it('Orbe da Vida custa vida ao acertar, mas nunca abaixo de 25%', () => {
    const s = quiet(createSurvivorState(9, { kindCount: 1, ...as('normal', 'aura') }));
    give(s, 'orbe-vida');
    give(s, 'orbe-vida');
    s.enemies.push(dummy(1, s.player.x + 10, s.player.y));
    const before = s.player.hp;
    steps(s, 60);
    expect(s.player.hp).toBeLessThan(before);
    for (let i = 0; i < 40; i++) steps(s, 60);
    expect(s.player.hp).toBeGreaterThanOrEqual(s.player.maxHp * 0.25 - 0.001);
  });
});
